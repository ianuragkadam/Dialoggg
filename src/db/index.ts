import { openDatabase } from "./connection";
import { assertSchemaCompatible } from "./migration-runner";

// Schema changes are deliberately excluded from module initialization. The
// deploy/test workflow must run the versioned migration command once first.
const db = openDatabase();
assertSchemaCompatible(db);

export default db;
