'use client';

import { useEffect, useState } from 'react';

import { REMOTE_NAMES, type RemoteName } from '@mfa/contracts';
import { Badge, Panel } from '@mfa/ui';

import { REMOTE_ENTRIES, pinnedEntry } from '@/mf/runtime';
import { injectedEntry } from '@/mf/versions/browser';

interface ProbeResult {
  remote: RemoteName;
  entry: string;
  /** 서버가 심어준 버전. 없으면 폴백 엔트리를 보고 있다는 뜻이다. */
  version: string | null;
  status: 'pending' | 'ok' | 'fail';
  detail: string;
}

/**
 * remote 가 안 뜰 때 원인을 빠르게 좁히기 위한 진단 화면.
 * MFA 에서 디버깅 시간을 가장 많이 잡아먹는 게 "누가 죽었는지" 파악이다.
 *
 * **런타임이 실제로 쓰는 URL 을 그대로 찔러야 한다.** 한동안 여기만 폴백 엔트리를
 * 부르고 있었는데, 그 주소는 dev 에만 실재해서 배포에서는 두 remote 가 멀쩡한데도
 * 진단만 `Failed to fetch` 로 빨갛게 떴다(404 + CORS 헤더 없음). 진단이 거짓말을 하면
 * 없는 장애를 쫓게 된다. 그래서 `pinnedEntry` 를 공유한다 — MF 런타임 초기화가 쓰는
 * 바로 그 함수다.
 *
 * 초기 상태는 폴백으로 둔다. 서버가 심는 값은 하이드레이션 이후에나 보이므로
 * 렌더 시점에 읽으면 서버/클라이언트 마크업이 갈린다. 실제 조회는 effect 에서 한다.
 */
export function MfDiagnostics() {
  const [results, setResults] = useState<ProbeResult[]>(() =>
    REMOTE_NAMES.map((remote) => ({
      remote,
      entry: REMOTE_ENTRIES[remote],
      version: null,
      status: 'pending' as const,
      detail: '확인 중…',
    })),
  );

  useEffect(() => {
    let cancelled = false;

    void Promise.all(
      REMOTE_NAMES.map(async (remote): Promise<ProbeResult> => {
        const entry = pinnedEntry(remote);
        const version = injectedEntry(remote)?.version ?? null;
        try {
          const res = await fetch(entry, { cache: 'no-store' });
          if (!res.ok) {
            return {
              remote,
              entry,
              version,
              status: 'fail',
              detail: `HTTP ${res.status}`,
            };
          }
          const manifest: unknown = await res.json();
          const exposes =
            manifest &&
            typeof manifest === 'object' &&
            'exposes' in manifest &&
            Array.isArray((manifest as { exposes: unknown[] }).exposes)
              ? (manifest as { exposes: { name?: string }[] }).exposes
                  .map((e) => e.name ?? '?')
                  .join(', ')
              : '(manifest 에 exposes 정보 없음)';
          return {
            remote,
            entry,
            version,
            status: 'ok',
            detail: `exposes: ${exposes}`,
          };
        } catch (error) {
          return {
            remote,
            entry,
            version,
            status: 'fail',
            detail: error instanceof Error ? error.message : String(error),
          };
        }
      }),
    ).then((next) => {
      if (!cancelled) setResults(next);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Panel
      origin="host · next 16"
      originHue={210}
      title="Module Federation 진단"
    >
      <table className="w-full border-collapse text-[13px]">
        <thead>
          <tr className="text-left text-muted">
            <th className="p-2">remote</th>
            <th className="p-2">상태</th>
            <th className="p-2">entry / 상세</th>
          </tr>
        </thead>
        <tbody>
          {results.map((r) => (
            <tr key={r.remote} className="border-t border-line">
              <td className="p-2 font-mono">{r.remote}</td>
              <td className="p-2">
                <Badge
                  hue={r.status === 'ok' ? 140 : r.status === 'fail' ? 0 : 45}
                >
                  {r.status}
                </Badge>
              </td>
              <td className="p-2 text-muted">
                <div className="font-mono text-xs">{r.entry}</div>
                <div>
                  {r.status !== 'pending' && (
                    <span className="font-mono text-[11px]">
                      {r.version
                        ? `버전 핀 ${r.version} · `
                        : '버전 핀 없음(폴백 엔트리) · '}
                    </span>
                  )}
                  {r.detail}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="m-0 text-xs leading-[1.7] text-muted">
        여기서 찌르는 URL 은 MF 런타임이 실제로 초기화에 쓰는 값과 같다 (
        <code>pinnedEntry</code>). 배포에서는 서버가 심어준{' '}
        <code>/v&lt;version&gt;/</code> 경로가 나오고, dev 에서는 버전 공표가
        없어 폴백 엔트리가 나온다.
        <br />
        fail 이면 (1) 해당 remote 미기동, (2) CORS 차단, (3) 포트 충돌 순으로
        확인. 배포에서 <strong>버전 핀 없음</strong> 인데 404 라면 remote 가{' '}
        <code>mf-version.json</code> 을 공표하지 못한 것이다 — 루트에는 그
        파일뿐이고 매니페스트는 버전 경로 아래에만 있다.
        <br />
        브라우저 콘솔에서 <code>__FEDERATION__</code> 전역으로 shared scope 실제
        상태를 볼 수 있다.
      </p>
    </Panel>
  );
}
