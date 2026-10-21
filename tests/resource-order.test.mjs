import assert from "node:assert/strict";
import test from "node:test";
import { sortResourcesByTypeAndName } from "../src/lib/resources-ui.ts";

test("resources are alphabetical within each type regardless of creation order", () => {
  const resources = [
    { id: 5, category: "Supplier", name: "Zebra Lumber" },
    { id: 4, category: "Team", name: "Mike Weller" },
    { id: 3, category: "Equipment", name: "18' Trailer" },
    { id: 2, category: "Team", name: "dennis Fuentes" },
    { id: 1, category: "Equipment", name: "12' Trailer" },
    { id: 6, category: "Supplier", name: "Alpha Supply" },
  ];

  assert.deepEqual(sortResourcesByTypeAndName(resources).map(resource => resource.name), [
    "12' Trailer", "18' Trailer", "Alpha Supply", "Zebra Lumber", "dennis Fuentes", "Mike Weller",
  ]);
  assert.equal(resources[0].name, "Zebra Lumber");
});
