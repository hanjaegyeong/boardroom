import { spawn, ChildProcess } from 'child_process';
import fs from 'fs';
import path from 'path';
import { personas, AGENT_ORDER } from './personas.js';
import { store } from '../store.js';
import { SSEEvent, Document } from './types.js';

const CLAUDE_PATH = process.env.CLAUDE_PATH || 'claude';

type SSEEmitter = (event: SSEEvent) => void;

// Token usage tracking
interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  totalCalls: number;
  costUsd: number;
}

let tokenUsage: TokenUsage = { inputTokens: 0, outputTokens: 0, totalCalls: 0, costUsd: 0 };

// Persistent state for continuous discussion
let currentEmit: SSEEmitter | null = null;
let currentTask = '';
let roundNumber = 0;
let allDiscussions: Record<string, string>[] = [];
let analyses: Record<string, string> = {};
let allParticipants: Set<string> = new Set();
let activeProcess: ChildProcess | null = null;
let isStopped = false;

// Max tokens per call type
const MAX_BUDGET_DISCUSSION = '0.05';
const MAX_BUDGET_DOCUMENT = '0.25';

// --- Dynamic agent selection ---

async function selectNextSpeakers(
  task: string,
  context: string,
  alreadySpokenThisRound: string[] = [],
): Promise<string[]> {
  const available = AGENT_ORDER.filter(
    id => id !== 'ceo' && !alreadySpokenThisRound.includes(id),
  );
  if (available.length === 0) return [];

  const agentDesc = available
    .map(id => {
      const p = personas[id];
      const inMeeting = allParticipants.has(id) ? ' [현재 참여중]' : '';
      return `- ${id}: ${p.title} ${p.name} (${p.expertise.join(', ')})${inMeeting}`;
    })
    .join('\n');

  const prompt = `현재 회의를 분석하고, 다음에 발언이 필요한 임원을 선택하세요.

업무: ${task}

현재 논의:
${truncateText(context, 1500)}

발언 가능한 임원:
${agentDesc}

규칙:
- 현재 논의에서 전문성이 직접 필요한 임원만 선택
- 필요 없으면 빈 배열 []
- 최대 4명
JSON 배열만 출력 (예: ["cto","cfo"]):`;

  try {
    const response = await callClaude(prompt, 200);
    const match = response.match(/\[.*\]/s);
    if (match) {
      const ids = JSON.parse(match[0]) as string[];
      return ids.filter(id => available.includes(id));
    }
  } catch (err) {
    console.error('Speaker selection error:', err);
  }
  return [];
}

// Bring an agent into the meeting if not already present
async function bringAgent(agentId: string, emit: SSEEmitter): Promise<void> {
  if (allParticipants.has(agentId)) return;
  allParticipants.add(agentId);
  emit({ type: 'agents_selected', agents: Array.from(allParticipants) });
  emit({ type: 'agent_moving', agentId, destination: 'meeting' });
  await sleep(1500);
}

// --- Public API ---

export async function startRoundtable(task: string, emit: SSEEmitter) {
  store.reset();
  store.currentTask = task;
  store.isProcessing = true;
  currentEmit = emit;
  currentTask = task;
  roundNumber = 0;
  allDiscussions = [];
  analyses = {};
  allParticipants = new Set();
  isStopped = false;
  tokenUsage = { inputTokens: 0, outputTokens: 0, totalCalls: 0, costUsd: 0 };

  const taskId = Date.now().toString(36);

  try {
    emit({ type: 'task_accepted', taskId, summary: task });

    // CEO always joins first
    await bringAgent('ceo', emit);

    // CEO Briefing
    emit({ type: 'phase_change', phase: 'briefing', label: 'CEO 브리핑' });
    const ceoBriefing = await getAgentResponse('ceo',
      `새로운 업무가 접수되었습니다. 당신이 CEO로서 이 업무를 팀에 브리핑해주세요.\n\n업무 내용: ${task}\n\n팀원들에게 각자의 역할에 맞게 이 업무에 대한 의견과 분석을 요청하세요.`,
      emit);
    if (isStopped) return;

    analyses = { ceo: ceoBriefing };

    // Dynamically select first batch based on CEO's briefing
    emit({ type: 'phase_change', phase: 'analysis', label: '관련 전문가 호출 중...' });
    const firstBatch = await selectNextSpeakers(task, ceoBriefing);
    emitUsageUpdate(emit);
    if (isStopped) return;

    // Bring first batch into meeting
    for (const agentId of firstBatch) {
      if (isStopped) return;
      await bringAgent(agentId, emit);
    }

    // Each gives initial analysis
    emit({ type: 'phase_change', phase: 'analysis', label: '개별 분석' });
    for (const agentId of firstBatch) {
      if (isStopped) return;
      const persona = personas[agentId];
      const response = await getAgentResponse(agentId,
        `CEO Alexandra가 다음과 같이 팀 회의를 시작했습니다:\n\n[CEO Alexandra]: ${ceoBriefing}\n\n원래 업무 요청: ${task}\n\n당신의 전문 분야(${persona.expertise.join(', ')}) 관점에서 이 업무에 대한 초기 분석과 의견을 제시해주세요.`,
        emit);
      analyses[agentId] = response;
    }
    if (isStopped) return;

    // First discussion round
    await runDiscussionRound(emit);

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
    emit({ type: 'phase_change', phase: 'documents', label: '산출물 작성 중...' });

    const participants = Array.from(allParticipants);
    for (const agentId of participants) {
      emit({ type: 'agent_moving', agentId, destination: 'desk' });
    }
    await sleep(2000);
    if (isStopped) return;

    const fullLog = buildFullLog();

    for (const agentId of participants) {
      if (isStopped) return;
      await generateDocument(agentId, currentTask, fullLog, emit);
    }

    const outputDir = saveToDesktop(currentTask, fullLog);

    emit({ type: 'phase_change', phase: 'complete', label: '회의 완료' });
    emit({
      type: 'task_complete',
      summary: `회의가 완료되었습니다. ${store.documents.length}개의 산출물이 생성되었습니다.\n저장 위치: ${outputDir}`,
    });
  } catch (error: any) {
    if (!isStopped) {
      console.error('Finalize error:', error);
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
    currentEmit({ type: 'task_complete', summary: '회의가 중단되었습니다.' });
  }
}

// --- Discussion round ---

async function runDiscussionRound(emit: SSEEmitter) {
  roundNumber++;
  emit({ type: 'phase_change', phase: 'discussion', label: `토론 라운드 ${roundNumber}` });

  const thisRound: Record<string, string> = {};
  const spokenThisRound: string[] = [];

  // Wave 1: select speakers based on current context
  const context = buildPreviousContext();
  const wave1 = await selectNextSpeakers(currentTask, context, spokenThisRound);
  emitUsageUpdate(emit);

  // Bring new agents if needed
  for (const agentId of wave1) {
    if (isStopped) return;
    await bringAgent(agentId, emit);
  }

  // Include CEO in discussion if not in wave1
  const speakers1 = wave1.includes('ceo') ? wave1 : ['ceo', ...wave1];

  for (const agentId of speakers1) {
    if (isStopped) return;
    const prevContext = buildPreviousContext();
    const otherOpinions = Object.entries({ ...analyses, ...thisRound })
      .filter(([id]) => id !== agentId)
      .map(([id, text]) => `[${personas[id].title} ${personas[id].name}]: ${truncateText(text, 300)}`)
      .join('\n\n');

    const prompt = roundNumber === 1
      ? `지금까지의 팀 토론 내용입니다:\n\n${otherOpinions}\n\n다른 임원들의 의견을 듣고, 동의하거나 보완할 점, 우려사항, 또는 새로운 제안이 있다면 말씀해주세요.`
      : `토론 라운드 ${roundNumber}입니다.\n\n지금까지의 전체 논의:\n${prevContext}\n\n이전 라운드를 바탕으로 더 발전시킬 아이디어, 새로운 관점, 구체적인 실행 방안을 제시해주세요.`;

    const response = await getAgentResponse(agentId, prompt, emit);
    thisRound[agentId] = response;
    spokenThisRound.push(agentId);
  }

  // Wave 2: check if new experts are needed based on what just emerged
  if (!isStopped) {
    const updatedContext = buildPreviousContext() + '\n\n--- 현재 라운드 ---\n\n' +
      Object.entries(thisRound)
        .map(([id, text]) => `[${personas[id].title} ${personas[id].name}]: ${text}`)
        .join('\n\n');

    const wave2 = await selectNextSpeakers(currentTask, updatedContext, spokenThisRound);
    emitUsageUpdate(emit);

    if (wave2.length > 0) {
      emit({ type: 'phase_change', phase: 'discussion', label: `추가 전문가 의견` });

      for (const agentId of wave2) {
        if (isStopped) return;
        await bringAgent(agentId, emit);
      }

      for (const agentId of wave2) {
        if (isStopped) return;
        const prompt = `팀 논의에 합류하게 되었습니다.\n\n원래 업무: ${currentTask}\n\n지금까지의 논의:\n${updatedContext}\n\n당신의 전문 분야 관점에서 의견을 제시해주세요. 특히 기존 논의에서 놓친 점이나 보완할 사항을 중심으로 답변하세요.`;
        const response = await getAgentResponse(agentId, prompt, emit);
        thisRound[agentId] = response;
        spokenThisRound.push(agentId);
      }
    }
  }

  allDiscussions.push(thisRound);
  store.isProcessing = false;

  if (!isStopped) {
    emit({ type: 'phase_change', phase: 'waiting', label: `라운드 ${roundNumber} 완료` });
    emit({
      type: 'task_complete',
      summary: `라운드 ${roundNumber} 완료. "계속 토론" 또는 "산출물 생성"을 선택하세요.`,
    });
  }
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
            // Extract usage from result event
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
      // Parse JSON output to extract result and usage
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

  const fullPrompt = `[시스템 지시사항]\n${persona.systemPrompt}\n\n[사용자 요청]\n${prompt}\n\n위 시스템 지시사항의 역할에 맞게 한국어로 3-5문장으로 답변해주세요.`;

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

async function generateDocument(agentId: string, task: string, discussionLog: string, emit: SSEEmitter): Promise<void> {
  const persona = personas[agentId];
  const prompt = `[시스템 지시사항]\n${persona.systemPrompt}\n\n지금은 문서 작성 모드입니다. 전문적이고 상세한 보고서를 작성하세요.\n\n[사용자 요청]\n원래 업무 요청: ${task}\n\n팀 토론 전체 기록:\n${discussionLog}\n\n"${persona.documentType}" 문서를 마크다운으로 작성하세요. 제목, 소제목, 불릿포인트, 표를 활용하여 구체적이고 실행 가능한 내용을 포함하세요.`;

  try {
    const content = await callClaude(prompt);
    const doc: Document = {
      id: `doc_${agentId}_${Date.now()}`, agentId,
      agentTitle: persona.title, agentName: persona.name,
      title: `${persona.title}: ${persona.documentType}`,
      content, timestamp: Date.now(),
    };
    store.addDocument(doc);
    emit({ type: 'document_ready', docId: doc.id, agentId, agentTitle: persona.title, title: doc.title });
    emitUsageUpdate(emit);
  } catch (error: any) {
    if (!isStopped) console.error(`Doc error for ${agentId}:`, error);
  }
}

// --- Context builders ---

// Truncate text to maxLen, cutting at the last word boundary
function truncateText(text: string, maxLen: number): string {
  if (text.length <= maxLen) return text;
  const truncated = text.slice(0, maxLen);
  const lastSpace = truncated.lastIndexOf(' ');
  return (lastSpace > maxLen * 0.5 ? truncated.slice(0, lastSpace) : truncated) + '...';
}

function buildPreviousContext(): string {
  // Compress analyses for context (keep to ~200 chars each)
  let ctx = Object.entries(analyses)
    .map(([id, text]) => `[${personas[id].title} ${personas[id].name} - 초기분석]: ${truncateText(text, 200)}`)
    .join('\n\n');

  for (let i = 0; i < allDiscussions.length; i++) {
    const isLatestRound = i === allDiscussions.length - 1;
    ctx += `\n\n--- 라운드 ${i + 1} ---\n\n`;
    ctx += Object.entries(allDiscussions[i])
      .map(([id, text]) => {
        // Keep latest round in full, compress older rounds
        const content = isLatestRound ? text : truncateText(text, 200);
        return `[${personas[id].title} ${personas[id].name}]: ${content}`;
      })
      .join('\n\n');
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
      log += `[${personas[id].title} ${personas[id].name}]: ${text}\n\n`;
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
  const outputDir = path.join(desktopDir, `BoardRoom_${dateStr}_${timeStr}_${taskShort}`);

  try {
    fs.mkdirSync(outputDir, { recursive: true });
    fs.writeFileSync(path.join(outputDir, '00_회의기록.md'),
      `# 회의 기록\n\n**업무 요청:** ${task}\n**일시:** ${now.toLocaleString('ko-KR')}\n**토론 라운드:** ${roundNumber}회\n\n---\n\n${discussionLog}`, 'utf-8');

    for (let i = 0; i < store.documents.length; i++) {
      const doc = store.documents[i];
      const fileName = `${String(i + 1).padStart(2, '0')}_${doc.agentTitle}_${doc.agentName}_보고서.md`;
      fs.writeFileSync(path.join(outputDir, fileName),
        `# ${doc.title}\n\n**작성자:** ${doc.agentTitle} ${doc.agentName}\n**일시:** ${new Date(doc.timestamp).toLocaleString('ko-KR')}\n\n---\n\n${doc.content}`, 'utf-8');
    }
    console.log(`Documents saved to: ${outputDir}`);
    return outputDir;
  } catch (error: any) {
    console.error('Failed to save:', error);
    return '(저장 실패)';
  }
}
