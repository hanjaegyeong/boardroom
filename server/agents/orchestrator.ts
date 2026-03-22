import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { personas, DEPARTMENTS, AGENT_ORDER, getDepartmentAgents } from './personas.js';
import { store } from '../store.js';
import { SSEEvent, Document } from './types.js';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

type SSEEmitter = (event: SSEEvent) => void;

interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCalls: number;
  costUsd: number;
}

let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalCalls: 0, costUsd: 0 };

let currentEmit: SSEEmitter | null = null;
let currentTask = '';
let roundNumber = 0;
let allDiscussions: Record<string, string>[] = [];
let analyses: Record<string, string> = {};
let allParticipants: Set<string> = new Set();
let activeDepartments: string[] = [];
let activeProcess: ChildProcess | null = null;
let isStopped = false;
let ceoMessages: string[] = [];

const MAX_BUDGET_DISCUSSION = '0.05';
const MAX_BUDGET_DOCUMENT = '0.25';

// --- Department analysis ---

async function analyzeTaskDepartments(task: string, previousContext: string): Promise<string[]> {
  const deptDesc = Object.entries(DEPARTMENTS)
    .map(([id, dept]) => {
      const agents = dept.agents.map(aid => {
        const p = personas[aid];
        return `${p.title} ${p.name} (${p.expertise.join(', ')})`;
      }).join(', ');
      return `- ${id} (${dept.name}): ${agents}`;
    })
    .join('\n');

  const prompt = `다음 업무 요청을 분석하여 어떤 부서가 참여해야 하는지 결정하세요.

업무: ${task}
${previousContext ? `\n이전 회의 맥락:\n${truncateText(previousContext, 500)}\n` : ''}
가용 부서:
${deptDesc}

규칙:
- 해당 업무와 직접 관련된 부서만 선택
- 두 부서 모두 필요하면 둘 다 선택
- JSON 배열만 출력 (예: ["marketing"] 또는 ["marketing","development"])
JSON 배열만 출력:`;

  try {
    const response = await callClaude(prompt, '0.03');
    const match = response.match(/\[.*\]/s);
    if (match) {
      const ids = JSON.parse(match[0]) as string[];
      return ids.filter(id => id in DEPARTMENTS);
    }
  } catch (err) {
    console.error('Department analysis error:', err);
  }
  // Default: both departments
  return ['marketing', 'development'];
}

// --- Dynamic speaker selection within departments ---

async function selectDepartmentSpeakers(
  department: string,
  task: string,
  context: string,
  alreadySpoken: string[] = [],
): Promise<string[]> {
  const deptAgents = getDepartmentAgents(department);
  const available = deptAgents.filter(id => !alreadySpoken.includes(id));
  if (available.length === 0) return [];

  const agentDesc = available
    .map(id => {
      const p = personas[id];
      const inMeeting = allParticipants.has(id) ? ' [현재 참여중]' : '';
      return `- ${id}: ${p.title} ${p.name} (${p.expertise.join(', ')})${inMeeting}`;
    })
    .join('\n');

  const prompt = `현재 회의를 분석하고, ${DEPARTMENTS[department].name}에서 다음에 발언이 필요한 팀원을 선택하세요.

업무: ${task}

현재 논의:
${truncateText(context, 1500)}

발언 가능한 팀원:
${agentDesc}

규칙:
- 현재 논의에서 전문성이 직접 필요한 팀원만 선택
- 필요 없으면 빈 배열 []
- 최대 3명
JSON 배열만 출력:`;

  try {
    const response = await callClaude(prompt, '0.03');
    const match = response.match(/\[.*\]/s);
    if (match) {
      const ids = JSON.parse(match[0]) as string[];
      return ids.filter(id => available.includes(id));
    }
  } catch (err) {
    console.error('Speaker selection error:', err);
  }
  return available;
}

async function bringAgent(agentId: string, emit: SSEEmitter): Promise<void> {
  if (allParticipants.has(agentId)) return;
  allParticipants.add(agentId);
  emit({ type: 'agents_selected', agents: Array.from(allParticipants) });
  emit({ type: 'agent_moving', agentId, destination: 'meeting' });
  await sleep(1500);
}

// --- Public API ---

export async function startRoundtable(task: string, emit: SSEEmitter, selectedDepartments?: string[]) {
  store.reset();
  store.currentTask = task;
  store.isProcessing = true;
  currentEmit = emit;
  currentTask = task;
  roundNumber = 0;
  allDiscussions = [];
  analyses = {};
  allParticipants = new Set();
  activeDepartments = [];
  isStopped = false;
  ceoMessages = [];
  tokenUsage = { inputTokens: 0, outputTokens: 0, totalCalls: 0, costUsd: 0 };

  const taskId = Date.now().toString(36);

  try {
    emit({ type: 'task_accepted', taskId, summary: task });

    // Load previous conversation context
    const previousContext = store.getRecentContext();

    // Use user-selected departments or auto-detect
    if (selectedDepartments && selectedDepartments.length > 0) {
      activeDepartments = selectedDepartments.filter(d => d in DEPARTMENTS);
    } else {
      emit({ type: 'phase_change', phase: 'analysis', label: '관련 부서 분석 중...' });
      activeDepartments = await analyzeTaskDepartments(task, previousContext);
      emitUsageUpdate(emit);
    }
    if (activeDepartments.length === 0) {
      activeDepartments = ['marketing', 'development'];
    }
    if (isStopped) return;

    // For each relevant department
    for (const deptId of activeDepartments) {
      if (isStopped) return;
      const dept = DEPARTMENTS[deptId];

      emit({ type: 'department_activated', department: deptId, agents: dept.agents });

      // Team lead joins and briefs
      await bringAgent(dept.lead, emit);
      emit({ type: 'phase_change', phase: 'briefing', label: `${dept.name} 팀장 브리핑` });

      const contextStr = previousContext
        ? `\n\n참고로 이전 회의에서 다뤘던 내용입니다:\n${previousContext}`
        : '';

      const leadBriefing = await getAgentResponse(dept.lead,
        `새로운 업무가 접수되었습니다. ${dept.name} 팀장으로서 이 업무를 팀에 브리핑해주세요.\n\n업무 내용: ${task}${contextStr}\n\n팀원들에게 각자의 역할에 맞게 이 업무에 대한 의견과 분석을 요청하세요.`,
        emit);
      if (isStopped) return;

      analyses[dept.lead] = leadBriefing;

      // Bring team members
      emit({ type: 'phase_change', phase: 'analysis', label: `${dept.name} 팀원 분석` });
      const members = dept.agents.filter(id => id !== dept.lead);
      for (const memberId of members) {
        if (isStopped) return;
        await bringAgent(memberId, emit);
        const persona = personas[memberId];
        const response = await getAgentResponse(memberId,
          `${personas[dept.lead].title} ${personas[dept.lead].name}이 다음과 같이 팀 회의를 시작했습니다:\n\n[${personas[dept.lead].title} ${personas[dept.lead].name}]: ${leadBriefing}\n\n원래 업무 요청: ${task}\n\n당신의 전문 분야(${persona.expertise.join(', ')}) 관점에서 이 업무에 대한 초기 분석과 의견을 제시해주세요.`,
          emit);
        analyses[memberId] = response;
      }
    }
    if (isStopped) return;

    // Intra-department discussion round
    await runDiscussionRound(emit);

    // Auto-finalize: generate report without waiting for user action
    if (!isStopped) {
      await finalizeDocuments(emit);
    }

  } catch (error: any) {
    if (!isStopped) {
      console.error('Orchestrator error:', error);
      emit({ type: 'error', message: error.message || 'An error occurred' });
      store.isProcessing = false;
    }
  }
}

export async function continueDiscussion(emit: SSEEmitter) {
  currentEmit = emit;
  store.isProcessing = true;
  try {
    await runDiscussionRound(emit);
    if (!isStopped) {
      await finalizeDocuments(emit);
    }
  } catch (error: any) {
    if (!isStopped) {
      console.error('Continue error:', error);
      emit({ type: 'error', message: error.message || 'An error occurred' });
      store.isProcessing = false;
    }
  }
}

export async function finalizeDocuments(emit: SSEEmitter) {
  currentEmit = emit;
  store.isProcessing = true;
  isStopped = false;

  try {
    emit({ type: 'phase_change', phase: 'documents', label: '총합 보고서 작성 중...' });

    const participants = Array.from(allParticipants);
    for (const agentId of participants) {
      emit({ type: 'agent_moving', agentId, destination: 'desk' });
    }
    await sleep(2000);
    if (isStopped) return;

    const fullLog = buildFullLog();

    // Generate ONE combined report instead of per-agent reports
    await generateCombinedReport(currentTask, fullLog, emit);

    const outputDir = saveToDesktop(currentTask, fullLog);

    // Save session for context persistence
    store.saveSession();

    emit({ type: 'phase_change', phase: 'complete', label: '보고서 완료' });

    // Ask user if they want to generate project
    emit({ type: 'confirm_download', reportPath: outputDir });

  } catch (error: any) {
    if (!isStopped) {
      console.error('Finalize error:', error);
      emit({ type: 'error', message: error.message || 'An error occurred' });
    }
  } finally {
    store.isProcessing = false;
  }
}

// Generate actual project from discussion
export async function generateProject(emit: SSEEmitter) {
  currentEmit = emit;
  store.isProcessing = true;
  isStopped = false;

  try {
    emit({ type: 'project_generating', message: '프로젝트 생성 중...' });
    emit({ type: 'phase_change', phase: 'documents', label: '프로젝트 코드 생성 중...' });

    const fullLog = buildFullLog();
    const projectDir = await generateProjectFiles(currentTask, fullLog, emit);

    emit({ type: 'project_complete', projectPath: projectDir });
    emit({ type: 'phase_change', phase: 'complete', label: '프로젝트 생성 완료' });
    emit({
      type: 'task_complete',
      summary: `프로젝트가 생성되었습니다.\n저장 위치: ${projectDir}`,
    });
  } catch (error: any) {
    if (!isStopped) {
      console.error('Project generation error:', error);
      emit({ type: 'error', message: error.message || 'An error occurred' });
    }
  } finally {
    store.isProcessing = false;
  }
}

export function stopAll() {
  isStopped = true;
  store.isProcessing = false;

  if (activeProcess) {
    activeProcess.kill('SIGTERM');
    activeProcess = null;
  }

  if (currentEmit) {
    currentEmit({ type: 'phase_change', phase: 'stopped', label: '회의 중단됨' });
    // Don't emit task_complete — let UI show finalize option
    const hasContent = allParticipants.size > 0 && (Object.keys(analyses).length > 0 || allDiscussions.length > 0);
    currentEmit({
      type: 'task_complete',
      summary: hasContent
        ? '회의가 중단되었습니다. "산출물 생성"을 눌러 현재까지의 내용으로 산출물을 생성할 수 있습니다.'
        : '회의가 중단되었습니다.',
    });
  }
}

export function addCeoMessage(text: string, emit: SSEEmitter) {
  ceoMessages.push(text);
  emit({ type: 'ceo_message', text });
}

export function hasDiscussionContent(): boolean {
  return allParticipants.size > 0 && (Object.keys(analyses).length > 0 || allDiscussions.length > 0);
}

// --- Discussion round ---

async function runDiscussionRound(emit: SSEEmitter) {
  roundNumber++;
  const thisRound: Record<string, string> = {};
  const spokenThisRound: string[] = [];

  // Phase 1: Intra-department discussion
  for (const deptId of activeDepartments) {
    if (isStopped) return;
    const dept = DEPARTMENTS[deptId];
    emit({ type: 'phase_change', phase: 'discussion', label: `${dept.name} 내부 토론 (라운드 ${roundNumber})` });

    const context = buildPreviousContext();
    const speakers = await selectDepartmentSpeakers(deptId, currentTask, context, spokenThisRound);
    emitUsageUpdate(emit);

    // Include lead if not in speakers
    const deptSpeakers = speakers.includes(dept.lead) ? speakers : [dept.lead, ...speakers];

    for (const agentId of deptSpeakers) {
      if (isStopped) return;
      const otherOpinions = Object.entries({ ...analyses, ...thisRound })
        .filter(([id]) => id !== agentId)
        .map(([id, text]) => `[${personas[id].title} ${personas[id].name}]: ${truncateText(text, 300)}`)
        .join('\n\n');

      const prompt = roundNumber === 1
        ? `지금까지의 팀 토론 내용입니다:\n\n${otherOpinions}\n\n다른 팀원들의 의견을 듣고, 동의하거나 보완할 점, 우려사항, 또는 새로운 제안이 있다면 말씀해주세요.`
        : `토론 라운드 ${roundNumber}입니다.\n\n지금까지의 전체 논의:\n${buildPreviousContext()}\n\n이전 라운드를 바탕으로 더 발전시킬 아이디어, 새로운 관점, 구체적인 실행 방안을 제시해주세요.`;

      const response = await getAgentResponse(agentId, prompt, emit);
      thisRound[agentId] = response;
      spokenThisRound.push(agentId);
    }
  }

  // Phase 2: Cross-department meeting (if multiple departments are active)
  if (activeDepartments.length > 1 && !isStopped) {
    emit({ type: 'phase_change', phase: 'discussion', label: '부서 간 합동 회의' });

    const crossContext = buildPreviousContext() + '\n\n--- 현재 라운드 ---\n\n' +
      Object.entries(thisRound)
        .map(([id, text]) => `[${personas[id].title} ${personas[id].name}]: ${text}`)
        .join('\n\n');

    // Each department lead speaks in cross-department context
    for (const deptId of activeDepartments) {
      if (isStopped) return;
      const leadId = DEPARTMENTS[deptId].lead;
      if (spokenThisRound.includes(leadId)) {
        // Lead speaks again with cross-department perspective
        const prompt = `부서 간 합동 회의입니다. 다른 부서의 의견도 종합하여, ${DEPARTMENTS[deptId].name} 관점에서 협업 방안이나 추가 제안을 해주세요.\n\n전체 논의:\n${crossContext}`;
        const response = await getAgentResponse(leadId, prompt, emit);
        thisRound[`${leadId}_cross`] = response;
      }
    }
  }

  allDiscussions.push(thisRound);
}

// --- Claude CLI ---

function streamClaude(prompt: string, onToken: (token: string) => void, maxBudget: string = MAX_BUDGET_DISCUSSION): Promise<string> {
  return new Promise((resolve, reject) => {
    if (isStopped) { resolve(''); return; }

    let fullText = '';
    let stderrText = '';

    const child = spawn(CLAUDE_PATH, [
      '-p', prompt,
      '--output-format', 'stream-json', '--verbose',
      '--max-budget-usd', maxBudget,
    ], {
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcess = child;

    let buffer = '';

    child.stdout.on('data', (chunk: Buffer) => {
      buffer += chunk.toString();
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const event = JSON.parse(line);
          if (event.type === 'assistant' && event.message?.content) {
            for (const block of event.message.content) {
              if (block.type === 'text') {
                const newText = block.text.slice(fullText.length);
                if (newText) { fullText = block.text; onToken(newText); }
              }
            }
          } else if (event.type === 'content_block_delta') {
            const text = event.delta?.text || '';
            if (text) { fullText += text; onToken(text); }
          } else if (event.type === 'result') {
            if (event.usage) {
              tokenUsage.inputTokens += event.usage.input_tokens || 0;
              tokenUsage.outputTokens += event.usage.output_tokens || 0;
            }
            if (typeof event.cost_usd === 'number') {
              tokenUsage.costUsd += event.cost_usd;
            }
            tokenUsage.totalCalls++;
            if (event.result && !fullText) { fullText = event.result; onToken(event.result); }
          }
        } catch {
          if (line.trim()) { fullText += line; onToken(line); }
        }
      }
    });

    child.stderr.on('data', (chunk: Buffer) => { stderrText += chunk.toString(); });

    child.on('close', (code) => {
      activeProcess = null;
      if (buffer.trim()) {
        try {
          const ev = JSON.parse(buffer);
          if (ev.type === 'result') {
            if (ev.usage) {
              tokenUsage.inputTokens += ev.usage.input_tokens || 0;
              tokenUsage.outputTokens += ev.usage.output_tokens || 0;
            }
            if (typeof ev.cost_usd === 'number') {
              tokenUsage.costUsd += ev.cost_usd;
            }
            tokenUsage.totalCalls++;
            if (ev.result && !fullText) { fullText = ev.result; onToken(ev.result); }
          }
        } catch {
          if (!fullText) { fullText = buffer.trim(); onToken(buffer.trim()); }
        }
      }
      if (code !== 0 && !fullText && !isStopped) {
        reject(new Error(stderrText || `claude exited with code ${code}`));
      } else { resolve(fullText.trim()); }
    });

    child.on('error', (err) => { activeProcess = null; reject(err); });
    setTimeout(() => { child.kill(); activeProcess = null; reject(new Error('Timeout')); }, 120000);
  });
}

function callClaude(prompt: string, maxBudget: string = MAX_BUDGET_DOCUMENT): Promise<string> {
  return new Promise((resolve, reject) => {
    if (isStopped) { resolve(''); return; }

    let fullText = '';
    let stderrText = '';

    const child = spawn(CLAUDE_PATH, [
      '-p', prompt,
      '--output-format', 'json',
      '--max-budget-usd', maxBudget,
    ], {
      env: { ...process.env, PATH: process.env.PATH },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    activeProcess = child;

    child.stdout.on('data', (chunk: Buffer) => { fullText += chunk.toString(); });
    child.stderr.on('data', (chunk: Buffer) => { stderrText += chunk.toString(); });
    child.on('close', (code) => {
      activeProcess = null;
      let resultText = fullText.trim();
      try {
        const parsed = JSON.parse(resultText);
        if (parsed.usage) {
          tokenUsage.inputTokens += parsed.usage.input_tokens || 0;
          tokenUsage.outputTokens += parsed.usage.output_tokens || 0;
        }
        if (typeof parsed.cost_usd === 'number') {
          tokenUsage.costUsd += parsed.cost_usd;
        }
        tokenUsage.totalCalls++;
        resultText = parsed.result || resultText;
      } catch {
        // Not JSON, use raw text
      }
      if (code !== 0 && !resultText && !isStopped) { reject(new Error(stderrText || `exit ${code}`)); }
      else { resolve(resultText.trim()); }
    });
    child.on('error', (err) => { activeProcess = null; reject(err); });
    setTimeout(() => { child.kill(); activeProcess = null; reject(new Error('Timeout')); }, 120000);
  });
}

// --- Agent response ---

async function getAgentResponse(agentId: string, prompt: string, emit: SSEEmitter): Promise<string> {
  const persona = personas[agentId];
  emit({ type: 'agent_speak_start', agentId, name: persona.name, title: persona.title });

  const fullPrompt = `[시스템 지시사항]\n${persona.systemPrompt}\n\n[중요 맥락]\n이 회의의 결과물은 1인 개발자가 혼자 구현합니다. 대규모 팀이나 전문 인력을 가정하지 마세요. 최소 리소스로 빠르게 만들 수 있는 현실적 방안만 제안하세요. 프론트/백엔드를 나누지 말고 Next.js, React Native, Supabase 같은 통합 솔루션을 우선 추천하세요.\n\n[사용자 요청]\n${prompt}\n\n위 시스템 지시사항의 역할에 맞게 한국어로 3-5문장으로 답변해주세요.`;

  let fullResponse = '';
  try {
    fullResponse = await streamClaude(fullPrompt, (token) => {
      emit({ type: 'agent_speak_token', agentId, token });
    });
  } catch (error: any) {
    if (!isStopped) {
      fullResponse = `[오류: ${error.message}]`;
      emit({ type: 'agent_speak_token', agentId, token: fullResponse });
    }
  }

  store.addAgentMessage(agentId, 'user', prompt);
  store.addAgentMessage(agentId, 'assistant', fullResponse);
  store.addToTranscript({
    agentId, agentName: persona.name, agentTitle: persona.title,
    content: fullResponse, phase: 'discussion', timestamp: Date.now(),
  });
  emit({ type: 'agent_speak_end', agentId, fullText: fullResponse });
  emitUsageUpdate(emit);
  await sleep(500);
  return fullResponse;
}

function emitUsageUpdate(emit: SSEEmitter) {
  emit({
    type: 'usage_update',
    inputTokens: tokenUsage.inputTokens,
    outputTokens: tokenUsage.outputTokens,
    totalCalls: tokenUsage.totalCalls,
    costUsd: tokenUsage.costUsd,
  });
}

// --- Document generation ---

async function generateCombinedReport(task: string, discussionLog: string, emit: SSEEmitter): Promise<void> {
  const deptNames = activeDepartments.map(d => DEPARTMENTS[d].name).join(', ');
  const participantList = Array.from(allParticipants)
    .filter(id => personas[id])
    .map(id => `${personas[id].title} ${personas[id].name}`)
    .join(', ');

  const prompt = `다음 팀 회의 전체 기록을 바탕으로 총합 보고서를 마크다운으로 작성하세요.

업무 요청: ${task}
참여 부서: ${deptNames}
참여자: ${participantList}

팀 토론 전체 기록:
${discussionLog}

중요: 이 보고서의 대상은 1인 개발자입니다. 대규모 팀이 필요한 계획이 아니라, 혼자서 구현 가능한 실행 계획을 작성하세요. 프론트/백엔드를 나누지 말고 Next.js, React Native, Supabase 같은 통합 솔루션 활용을 권장하세요.

총합 보고서에 포함할 내용:
1. 요약 - 핵심 결론과 권장 사항
2. 주요 논의 사항 - 팀원들의 핵심 의견 정리
3. 합의된 전략/방향
4. 실행 계획 - 1인 개발자가 바로 착수할 수 있는 구체적 단계
5. 기술 스택 - 통합 프레임워크 중심의 추천

마크다운 제목, 소제목, 불릿포인트, 표를 활용하여 실행 가능한 보고서를 작성하세요.
한국어로 작성하세요.`;

  try {
    const content = await callClaude(prompt, '0.50');
    const doc: Document = {
      id: `doc_combined_${Date.now()}`,
      agentId: 'combined',
      agentTitle: '총합',
      agentName: 'Nano Office',
      title: '총합 보고서',
      content,
      timestamp: Date.now(),
    };
    store.addDocument(doc);
    emit({ type: 'document_ready', docId: doc.id, agentId: 'combined', agentTitle: '총합', title: doc.title });
    emitUsageUpdate(emit);
  } catch (error: any) {
    if (!isStopped) console.error('Combined report error:', error);
  }
}

async function generateProjectFiles(task: string, discussionLog: string, emit: SSEEmitter): Promise<string> {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const desktopDir = path.join(homeDir, 'Desktop');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
  const taskShort = task.slice(0, 30).replace(/[/\\?%*:|"<>]/g, '').trim();
  const projectDir = path.join(desktopDir, `NanoOffice_Project_${dateStr}_${timeStr}_${taskShort}`);

  fs.mkdirSync(projectDir, { recursive: true });

  const prompt = `당신은 시니어 풀스택 개발자입니다. 아래 회의 내용을 바탕으로 실제 동작하는 프로젝트를 생성하세요.

업무 요청: ${task}

회의 기록:
${discussionLog}

다음 JSON 형식으로 프로젝트 파일들을 출력하세요. 반드시 유효한 JSON만 출력하세요:
{
  "files": [
    { "path": "파일경로", "content": "파일내용" }
  ]
}

규칙:
- package.json, README.md 등 프로젝트 기본 파일 포함
- 실제 실행 가능한 코드 작성
- 회의에서 논의된 기술 스택과 방향을 반영
- 파일 경로는 프로젝트 루트 기준 상대 경로 사용
- 핵심 기능 위주로 MVP 수준의 코드 작성
- JSON만 출력, 다른 텍스트 없이`;

  try {
    const response = await callClaude(prompt, '1.00');
    emitUsageUpdate(emit);

    // Parse the file list from response
    const jsonMatch = response.match(/\{[\s\S]*"files"[\s\S]*\}/);
    if (jsonMatch) {
      const project = JSON.parse(jsonMatch[0]);
      if (Array.isArray(project.files)) {
        for (const file of project.files) {
          if (file.path && file.content) {
            const filePath = path.join(projectDir, file.path);
            const fileDir = path.dirname(filePath);
            fs.mkdirSync(fileDir, { recursive: true });
            fs.writeFileSync(filePath, file.content, 'utf-8');
          }
        }
        console.log(`Project generated: ${project.files.length} files in ${projectDir}`);
      }
    }
  } catch (error: any) {
    console.error('Project generation error:', error);
    // Write error log to project dir
    fs.writeFileSync(path.join(projectDir, 'ERROR.md'),
      `# 프로젝트 생성 오류\n\n${error.message}\n\n회의 기록을 참고하여 수동으로 프로젝트를 구성하세요.`, 'utf-8');
  }

  return projectDir;
}

// --- Context builders ---

function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

function buildPreviousContext(): string {
  let ctx = Object.entries(analyses)
    .map(([id, text]) => `[${personas[id].title} ${personas[id].name} - 초기분석]: ${truncateText(text, 200)}`)
    .join('\n\n');

  for (let i = 0; i < allDiscussions.length; i++) {
    const isLatestRound = i === allDiscussions.length - 1;
    ctx += `\n\n--- 라운드 ${i + 1} ---\n\n`;
    ctx += Object.entries(allDiscussions[i])
      .map(([id, text]) => {
        const cleanId = id.replace(/_cross$/, '');
        const content = isLatestRound ? text : truncateText(text, 200);
        return `[${personas[cleanId].title} ${personas[cleanId].name}]: ${content}`;
      })
      .join('\n\n');
  }

  if (ceoMessages.length > 0) {
    ctx += '\n\n--- CEO 지시사항 ---\n\n';
    ctx += ceoMessages.map(msg => `[CEO]: ${msg}`).join('\n\n');
  }

  return ctx;
}

function buildFullLog(): string {
  let log = '=== 초기 분석 ===\n\n';
  for (const [id, text] of Object.entries(analyses)) {
    log += `[${personas[id].title} ${personas[id].name}]: ${text}\n\n`;
  }
  for (let i = 0; i < allDiscussions.length; i++) {
    log += `\n=== 토론 라운드 ${i + 1} ===\n\n`;
    for (const [id, text] of Object.entries(allDiscussions[i])) {
      const cleanId = id.replace(/_cross$/, '');
      const suffix = id.endsWith('_cross') ? ' (부서 간 회의)' : '';
      log += `[${personas[cleanId].title} ${personas[cleanId].name}${suffix}]: ${text}\n\n`;
    }
  }
  if (ceoMessages.length > 0) {
    log += '\n=== CEO 지시사항 ===\n\n';
    for (const msg of ceoMessages) {
      log += `[CEO]: ${msg}\n\n`;
    }
  }
  return log;
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function saveToDesktop(task: string, discussionLog: string): string {
  const homeDir = process.env.HOME || process.env.USERPROFILE || '';
  const desktopDir = path.join(homeDir, 'Desktop');
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const timeStr = now.toTimeString().slice(0, 5).replace(':', '');
  const taskShort = task.slice(0, 30).replace(/[/\\?%*:|"<>]/g, '').trim();
  const outputDir = path.join(desktopDir, `NanoOffice_${dateStr}_${timeStr}_${taskShort}`);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, '00_회의기록.md'),
      `# 회의 기록\n\n**업무 요청:** ${task}\n**일시:** ${now.toLocaleString('ko-KR')}\n**참여 부서:** ${activeDepartments.map(d => DEPARTMENTS[d].name).join(', ')}\n**토론 라운드:** ${roundNumber}회\n\n---\n\n${discussionLog}`, 'utf-8');

    for (const doc of store.documents) {
      fs.writeFileSync(path.join(outputDir, '01_총합보고서.md'),
        `# ${doc.title}\n\n**일시:** ${new Date(doc.timestamp).toLocaleString('ko-KR')}\n**참여 부서:** ${activeDepartments.map(d => DEPARTMENTS[d].name).join(', ')}\n\n---\n\n${doc.content}`, 'utf-8');
    }
    console.log(`Documents saved to: ${outputDir}`);
    return outputDir;
  } catch (error: any) {
    console.error('Failed to save:', error);
    return '(저장 실패)';
  }
}
