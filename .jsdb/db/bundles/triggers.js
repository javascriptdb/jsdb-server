export async function push({req, value, result}) {
  const {importFromBase64} = await import("../../../lifecycleMiddleware.js");
  await importFromBase64(value.file.string);
}