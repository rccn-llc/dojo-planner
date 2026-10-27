/**
 * Terminal prompts for `org:create` on `node:readline` — no dependency.
 * Secrets are read with echo suppressed so they never land in scrollback.
 */

import process from 'node:process';
import readline from 'node:readline';

export function createPrompter(input: NodeJS.ReadStream = process.stdin, output: NodeJS.WriteStream = process.stdout) {
  async function ask(question: string, defaultValue?: string): Promise<string> {
    const rl = readline.createInterface({ input, output });
    const suffix = defaultValue ? ` [${defaultValue}]` : '';
    const answer = await new Promise<string>(resolve => rl.question(`${question}${suffix}: `, resolve));
    rl.close();
    return answer.trim() || defaultValue || '';
  }

  return {
    ask,

    /** Re-asks until `validate` returns null. */
    async askValid(question: string, validate: (value: string) => string | null, defaultValue?: string): Promise<string> {
      for (;;) {
        const value = await ask(question, defaultValue);
        const problem = validate(value);
        if (!problem) {
          return value;
        }
        output.write(`  ✗ ${problem}\n`);
      }
    },

    async confirm(question: string, defaultYes = false): Promise<boolean> {
      const answer = (await ask(`${question} (${defaultYes ? 'Y/n' : 'y/N'})`)).toLowerCase();
      return answer === '' ? defaultYes : answer === 'y' || answer === 'yes';
    },

    async choose<T extends string>(question: string, options: readonly T[], defaultValue: T): Promise<T> {
      for (;;) {
        const answer = await ask(`${question} (${options.join(' / ')})`, defaultValue);
        const match = options.find(o => o === answer.toLowerCase());
        if (match) {
          return match;
        }
        output.write(`  ✗ Choose one of: ${options.join(', ')}\n`);
      }
    },

    /** Read a secret without echoing it. */
    askSecret(question: string): Promise<string> {
      return new Promise((resolve, reject) => {
        output.write(`${question}: `);
        if (!input.isTTY) {
          // Piped input (tests, CI): no terminal to mute — read a line.
          const rl = readline.createInterface({ input });
          rl.once('line', (line) => {
            rl.close();
            resolve(line.trim());
          });
          return;
        }
        let value = '';
        input.setRawMode(true);
        input.resume();
        input.setEncoding('utf8');
        const onData = (chunk: string) => {
          for (const char of chunk) {
            if (char === '\r' || char === '\n') {
              input.setRawMode(false);
              input.pause();
              input.off('data', onData);
              output.write('\n');
              resolve(value.trim());
              return;
            }
            if (char === '\u0003') {
              input.setRawMode(false);
              output.write('\n');
              reject(new Error('Cancelled'));
              return;
            }
            value = char === '\u007F' || char === '\b' ? value.slice(0, -1) : value + char;
          }
        };
        input.on('data', onData);
      });
    },
  };
}

export type Prompter = ReturnType<typeof createPrompter>;
