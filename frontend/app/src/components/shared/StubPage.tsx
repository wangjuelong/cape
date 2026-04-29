import { PageHead } from "./PageHead";

interface StubPageProps {
  title: string;
  crumbs?: string[];
  description?: string;
  todo?: string[];
}

export function StubPage({ title, crumbs, description, todo }: StubPageProps) {
  return (
    <>
      <PageHead crumbs={crumbs ?? ["CAPE", title]} />
      <div className="flex-1 p-6">
        <div
          className="max-w-2xl rounded-md border p-6"
          style={{
            background: "var(--color-bg-1)",
            borderColor: "var(--color-border)",
          }}
        >
          <h1 className="mb-2 text-base font-semibold" style={{ color: "var(--color-fg-0)" }}>
            {title}
          </h1>
          {description && (
            <p className="mb-4 text-xs leading-relaxed" style={{ color: "var(--color-fg-1)" }}>
              {description}
            </p>
          )}
          {todo && todo.length > 0 && (
            <>
              <div
                className="mb-2 text-[10px] font-semibold uppercase tracking-wider"
                style={{ color: "var(--color-fg-2)" }}
              >
                Pending implementation
              </div>
              <ul className="list-disc pl-5 text-xs" style={{ color: "var(--color-fg-1)" }}>
                {todo.map((item) => (
                  <li key={item} className="mb-1">
                    {item}
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      </div>
    </>
  );
}
