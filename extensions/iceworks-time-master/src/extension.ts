import { ExtensionContext, commands } from 'vscode';
import { Recorder, recordDAU } from '@iceworks/recorder';
import { createTimerTreeView, TimerProvider, createTimerStatusBar, autoSetEnableViewsConfig } from './views';
import { openFileInEditor } from './utils/common';
import { getInterface as getKeystrokeStats } from './recorders/keystrokeStats';
import { getInterface as getUsageStatsRecorder } from './recorders/usageStats';
import { activate as activateWalkClock, deactivate as deactivateWalkClock } from './managers/walkClock';
import { generateProjectSummaryReport, generateUserSummaryReport } from './managers/data';
import logger from './utils/logger';

// eslint-disable-next-line
const { name, version } = require('../package.json');
const recorder = new Recorder(name, version);

const keystrokeStatsRecorder = getKeystrokeStats();
const usageStatsRecorder = getUsageStatsRecorder();

export async function activate(context: ExtensionContext) {
  logger.debug('[TimeMaster][extension] activate!');
  const { subscriptions, globalState } = context;

  // do not wait for async, let subsequent views be created
  activateWalkClock();

  autoSetEnableViewsConfig(globalState);

  // create views
  const timerProvider = new TimerProvider(context);
  const timerTreeView = createTimerTreeView(timerProvider);
  timerProvider.bindView(timerTreeView);

  const timerStatusBar = await createTimerStatusBar();
  timerStatusBar.activate();

  keystrokeStatsRecorder.activate().catch((e) => {
    logger.error('[TimeMaster][extension] activate keystrokeStatsRecorder got error:', e);
  });
  usageStatsRecorder.activate().catch((e) => {
    logger.error('[TimeMaster][extension] activate usageStatsRecorder got error:', e);
  });

  subscriptions.push(
    commands.registerCommand('iceworks-time-master.openFileInEditor', (fsPath: string) => {
      openFileInEditor(fsPath);
      recordDAU();
      recorder.record({
        module: 'command',
        action: 'openFileInEditor',
      });
    }),
    commands.registerCommand('iceworks-time-master.sendKeystrokeStatsMap', () => {
      keystrokeStatsRecorder.sendData();
    }),
    commands.registerCommand('iceworks-time-master.refreshTimerTree', () => {
      timerProvider.refresh();
    }),
    commands.registerCommand('iceworks-time-master.refreshTimerStatusBar', () => {
      timerStatusBar.refresh();
    }),
    commands.registerCommand('iceworks-time-master.displayTimerTree', () => {
      timerProvider.revealTreeView();
      recordDAU();
      recorder.record({
        module: 'command',
        action: 'displayTimerTree',
      });
    }),
    commands.registerCommand('iceworks-time-master.generateProjectSummaryReport', () => {
      generateProjectSummaryReport();
      recordDAU();
      recorder.record({
        module: 'command',
        action: 'generateProjectSummaryReport',
      });
    }),
    commands.registerCommand('iceworks-time-master.generateUserSummaryReport', () => {
      generateUserSummaryReport();
      recordDAU();
      recorder.record({
        module: 'command',
        action: 'generateUserSummaryReport',
      });
    }),
  );
}

export function deactivate() {
  logger.debug('[TimeMaster][extension] deactivate!');

  keystrokeStatsRecorder.deactivate().catch((e) => {
    logger.error('[TimeMaster][extension] deactivate keystrokeStatsRecorder got error:', e);
  });
  usageStatsRecorder.deactivate().catch((e) => {
    logger.error('[TimeMaster][extension] deactivate usageStatsRecorder got error:', e);
  });

  deactivateWalkClock();
}
