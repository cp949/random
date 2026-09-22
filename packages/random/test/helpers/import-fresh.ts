import { vi } from "vitest";

/**
 * 모듈 캐시를 비운 뒤 동적 import한다. 모듈 최상위의 import 시점 동작을 매번 새로 확인할 때 쓴다.
 * specifier는 절대 경로나 패키지 이름이다(이 helper 파일 기준 상대 경로가 아니다).
 */
export async function importFresh<T = unknown>(specifier: string): Promise<T> {
  vi.resetModules();
  return (await import(/* @vite-ignore */ specifier)) as T;
}
