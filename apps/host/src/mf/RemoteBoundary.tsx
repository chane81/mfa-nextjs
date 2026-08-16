'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

import { ErrorBox } from '@mfa/ui';

interface Props {
  remoteName: string;
  entry: string;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * remote 하나가 죽어도 host 전체가 죽지 않게 격리한다.
 * MFA 에서 가장 자주 빠뜨리는 부분 — 독립 배포는 곧 독립 장애를 뜻한다.
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
          detail={`entry: ${this.props.entry}\n${error.message}\n\nremote dev 서버가 떠 있는지 확인하세요.`}
        />
      );
    }
    return this.props.children;
  }
}
