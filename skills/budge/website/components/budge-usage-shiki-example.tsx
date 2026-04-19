import { codeToHtml } from "shiki";

import { BUDGE_USAGE_EXAMPLE_CODE } from "@/lib/budge-usage-example-code";

export async function BudgeUsageShikiExample() {
  const html = await codeToHtml(BUDGE_USAGE_EXAMPLE_CODE, {
    lang: "tsx",
    theme: "github-light",
  });

  return (
    <div className="mt-4 overflow-hidden rounded-[12px] border border-solid border-[color(display-p3_1_1_1)] [box-shadow:#0000000F_0px_0px_0px_1px,#0000000F_0px_1px_2px_-1px,#0000000A_0px_2px_4px] bg-[color(display-p3_0.991_0.991_0.991)]">
      <div
        className="font-mono-override overflow-x-auto text-left [&_pre]:m-0 [&_pre]:overflow-x-auto [&_pre]:rounded-none [&_pre]:!bg-transparent [&_pre]:p-3.5 sm:[&_pre]:p-3 [&_pre]:text-[12.5px]/[18px] sm:[&_pre]:text-[13px]/[19px] [&_code]:font-mono-override [&_code]:text-[inherit]"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
}
