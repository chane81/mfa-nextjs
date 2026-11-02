'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import type { RemoteName } from '@mfa/contracts/remote';
import { ErrorBox } from '@mfa/ui';

import { pinnedEntry } from '../../loader';

interface Props {
  remoteName: RemoteName;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * remote 하나가 죽어도 host 전체가 죽지 않게 격리한다 — 독립 배포는 곧 독립 장애를 뜻한다.
 *
 * **주소는 prop 으로 받지 않고 `pinnedEntry` 로 직접 고른다.** 한때 호출부가
 * `WEB_ENTRIES[remote]` 를 넘겼는데 그건 dev 에만 실재하는 폴백 주소라, 배포 장애에서
 * 에러 상자가 실패하지 않은 주소를 찍었다(known-issues J-1). 호출자가 그 답을 대신
 * 만들면 틀릴 방법이 생긴다.
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
