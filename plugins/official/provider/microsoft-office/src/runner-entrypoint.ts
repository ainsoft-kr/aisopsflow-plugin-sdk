import { startStdioJsonRuntime } from '../../../../../packages/js/runner-plugin-runtime/index.ts';
import {
  deleteOfficeFile,
  generateExcelFile,
  generatePowerPointFile,
  generateWordFile,
  readOfficeFile,
  writeOfficeFile,
} from "./generate.ts";

startStdioJsonRuntime({
  pluginName: "microsoft-office",
  version: "0.1.0",
  capabilities: [
    "microsoft.office.read",
    "microsoft.office.write",
    "microsoft.office.delete",
    "office.excel.generate",
    "office.word.generate",
    "office.powerpoint.generate",
  ],
  async handleInvoke({ capability, input }) {
    if (capability === "office.excel.generate") {
      return generateExcelFile(input || {});
    }
    if (capability === "office.word.generate") {
      return generateWordFile(input || {});
    }
    if (capability === "office.powerpoint.generate") {
      return generatePowerPointFile(input || {});
    }
    if (capability === "microsoft.office.read") {
      return readOfficeFile(input || {});
    }
    if (capability === "microsoft.office.write") {
      return writeOfficeFile(input || {});
    }
    if (capability === "microsoft.office.delete") {
      return deleteOfficeFile(input || {});
    }
    fail(`unsupported capability: ${capability}`, "unsupported_capability");
  },
});

function fail(message, code = "runtime_error") {
  const error = new Error(message);
  error.code = code;
  throw error;
}
