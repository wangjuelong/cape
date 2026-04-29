import { StubPage } from "@/components/shared/StubPage";

export default function SubmitRoute() {
  return (
    <StubPage
      title="Submit"
      description="File / URL submission with the 18 advanced parameters."
      todo={[
        "react-hook-form + zod schema for the 18 shared params",
        "POST /api/v3/tasks/file/ multipart upload",
        "POST /api/v3/tasks/url/ JSON body",
        "Redirect to /tasks/<id> after submission",
      ]}
    />
  );
}
