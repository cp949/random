/**
 * 자식 프로세스가 이 프로세스의 이벤트 루프에 의존하는 무언가(예: 같은 프로세스가 띄운 HTTP 서버)와
 * 통신할 때는 `spawnSync`를 쓰면 안 된다 — `spawnSync`는 이벤트 루프를 동기로 막아 서버가 요청을
 * 처리하지 못하고, 자식(예: chrome)은 응답을 기다리며 멈춘다(TRP 후보). `container-entry.mjs`·
 * `run.mjs`의 로컬 실행처럼 같은 프로세스의 서버에 접속하는 자식은 이 함수로 띄운다.
 */
import { spawn } from "node:child_process";

/**
 * @param {string} command
 * @param {string[]} args
 * @param {{ timeout?: number }} [options]
 * @returns {Promise<{ status: number | null, signal: string | null, stdout: string, stderr: string }>}
 */
export function runProcess(command, args, { timeout } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args);
    let stdout = "";
    let stderr = "";
    let timedOut = false;

    const timer = timeout
      ? setTimeout(() => {
          timedOut = true;
          child.kill("SIGTERM");
        }, timeout)
      : undefined;

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", (error) => {
      if (timer) clearTimeout(timer);
      reject(error);
    });
    child.on("close", (status, signal) => {
      if (timer) clearTimeout(timer);
      if (timedOut) {
        reject(new Error(`${command}이 ${timeout}ms 안에 끝나지 않았다`));
        return;
      }
      resolve({ status, signal, stdout, stderr });
    });
  });
}
