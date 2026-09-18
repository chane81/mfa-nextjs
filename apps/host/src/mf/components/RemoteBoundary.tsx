'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import type { RemoteName } from '@mfa/contracts/remote';
import { ErrorBox } from '@mfa/ui';

import { pinnedEntry } from '../loader';

interface Props {
  remoteName: RemoteName;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * remote 하나가 죽어도 host 전체가 죽지 않게 격리한다.
 * MFA 에서 가장 자주 빠뜨리는 부분 — 독립 배포는 곧 독립 장애를 뜻한다.
 *
 * ## 주소는 받지 않고 직접 고른다
 *
 * 한동안 `entry` 를 prop 으로 받았고, 두 호출부가 똑같이 `WEB_ENTRIES[remote]` 를
 * 넘겼다. 그건 **dev 에만 실재하는 폴백 주소**라(근거: `loader/index.ts` 의
 * `pinnedEntry` 머리말) 배포에서 remote 가 죽으면 에러 상자에는 404 나는 주소가 찍히고,
 * 정작 실패한 `/v<version>/mf-manifest.json` 은 어디에도 안 나왔다.
 * `MfDiagnostics` 가 같은 함정을 한 번 밟고 고쳤는데 에러 경계만 남아 있었다.
 *
 * "이 remote 를 지금 어느 주소로 부르나" 는 `pinnedEntry` 하나가 답한다.
 * 호출자가 그 답을 대신 만들면 **틀릴 방법이 생긴다** — 그래서 인터페이스에서 뺐다.
 */
export class RemoteBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // 실제 서비스라면 여기서 remote 이름과 함께 에러 트래커로 보낸다
    console.error(
      `[mfa] remote '${this.props.remoteName}' 로드 실패`,
      error,
      info,
    );
  }

  override render(): ReactNode {
    const { error } = this.state;
    if (error) {
      return (
        <ErrorBox
          title={`remote '${this.props.remoteName}' 를 불러오지 못했습니다`}
          detail={`entry: ${pinnedEntry(this.props.remoteName)}\n${error.message}\n\nremote dev 서버가 떠 있는지 확인하세요.`}
        />
      );
    }
    return this.props.children;
  }
}
