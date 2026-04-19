/** JavaScript example shown on the homepage (usage section), highlighted with Shiki. */
export const BUDGE_USAGE_EXAMPLE_CODE = `// After \`budge.iife.js\` is on the page (via your agent / bundle):
const root = document.getElementById("budge-root");

Budge.widget.mount(root, {
  slides: [
    {
      label: "Padding top",
      property: "padding-top",
      min: 0,
      max: 64,
      value: 16,
      original: 16,
      unit: "px",
    },
  ],
  autoFocus: true,
});
`;
