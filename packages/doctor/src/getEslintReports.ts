import * as fs from 'fs-extra';
import * as path from 'path';
import ignore from 'ignore';
import { CLIEngine } from 'eslint';
import { deepmerge, getESLintConfig } from '@iceworks/spec';
import Scorer from './Scorer';
import Timer from './Timer';
import { IEslintReports } from './types/Scanner';
import { IFileInfo } from './types/File';

// level waring minus 1 point
const WARNING_WEIGHT = -1;
// level error minus 3 point
const ERROR_WEIGHT = -3;
// bonus add 2 point
const BONUS_WEIGHT = 2;

const SUPPORT_FILE_REG = /(\.js|\.jsx|\.ts|\.tsx|package\.json)$/;

export default function getEslintReports(directory: string, timer: Timer, files: IFileInfo[], ruleKey: string, customConfig?: any, fix?: boolean): IEslintReports {
  let warningScore = 0;
  let warningCount = 0;

  let errorScore = 0;
  let errorCount = 0;

  // package.json object
  let packageInfo: any = {};

  const reports = [];

  const cliEngine = new CLIEngine({
    cache: false,
    baseConfig: deepmerge(getESLintConfig(ruleKey), customConfig),
    // Use plugin in @iceworks/spec
    cwd: path.dirname(require.resolve('@iceworks/spec')),
    fix: !!fix,
    useEslintrc: false,
  });

  const ig = ignore();
  const ignoreConfigFilePath = path.join(directory, '.eslintignore');
  if (fs.existsSync(ignoreConfigFilePath)) {
    ig.add(fs.readFileSync(ignoreConfigFilePath).toString());
  }

  const targetFiles: string[] = files.filter((file: IFileInfo) => {
    if (file.path.endsWith('package.json')) {
      packageInfo = JSON.parse(file.source);
    }
    return SUPPORT_FILE_REG.test(file.path) && !ig.ignores(file.path.replace(path.join(directory, '/'), ''));
  }).map((file: IFileInfo) => {
    // Use absolute path
    return file.path.startsWith('.') ? path.join(process.cwd(), file.path) : file.path;
  });

  const data = cliEngine.executeOnFiles(targetFiles);

  if (fix) {
    // output fixes to disk
    CLIEngine.outputFixes(data);
  }

  timer.checkTimeout();

  (data.results || []).forEach((result) => {
    // Remove Parsing error
    result.messages = (result.messages || []).filter((message) => {
      if (
        message.severity === 2 && (
          // Ignore Parsing error
          (message.fatal && message.message.startsWith('Parsing error:')) ||
          // Ignore no rules error
          message.message.startsWith('Definition for rule')
        )) {
        result.errorCount--;
        return false;
      }
      return true;
    });

    reports.push(result);
  });

  // calculate score
  reports.forEach((report) => {
    // Add critical level calculate.
    (report.messages || []).forEach((message) => {
      if (message.message.indexOf('[Critical]') === 0) {
        if (message.severity === 2) {
          // Critical error
          errorScore += ERROR_WEIGHT;
        } else {
          // Critical warning
          warningScore += WARNING_WEIGHT;
        }
      }
    });
    warningCount += report.warningCount;
    warningScore += report.warningCount * WARNING_WEIGHT;
    errorCount += report.errorCount;
    errorScore += report.errorCount * ERROR_WEIGHT;
  });

  const scorer = new Scorer();
  scorer.plus(warningScore);
  scorer.plus(errorScore);

  // Calculate bonus
  // recommend-deps-fusion-design
  if (packageInfo.dependencies && packageInfo.dependencies['@alifd/next']) {
    scorer.plus(BONUS_WEIGHT);
  }
  // recommend-typescript
  if (packageInfo.devDependencies && packageInfo.devDependencies.typescript) {
    scorer.plus(BONUS_WEIGHT);
  }

  return {
    score: scorer.getScore(),
    reports,
    errorCount,
    warningCount,
    customConfig,
  };
}
