export interface ErrorBoxProps {
  title: string;
  detail?: string;
}

export function ErrorBox({ title, detail }: ErrorBoxProps) {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-danger/35 bg-danger/7 p-5 text-text">
      <strong className="text-sm text-danger">{title}</strong>
      {detail ? (
        <code className="font-mono text-xs whitespace-pre-wrap text-muted">
          {detail}
        </code>
      ) : null}
    </div>
  );
}
