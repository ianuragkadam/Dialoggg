# Project Types UI Module

## Status

This is a UI-only implementation for client review. It intentionally uses domain-specific demonstration data and does not create, rename, reassign, or delete production records. Changes reset when the page is refreshed.

## Requirement traceability

| Requirement | UI coverage |
| --- | --- |
| `DG-TYP-001` | Screen language establishes that Project Types belong to the active company. The final API must enforce tenant isolation. |
| `DG-TYP-002` | Create and rename dialogs accept one text label only. Names are trimmed, required, limited to 50 characters, and compared case-insensitively for duplicates. |
| `DG-TYP-003` | Summary and guidance state that every Project must always have exactly one Project Type. |
| `DG-TYP-004` | Dedicated authenticated settings route, Admin navigation entry, restricted-access state, create dialog, and rename dialog. |
| `DG-TYP-005` | Rename impact text identifies All Projects and Master Calendar filters as downstream consumers. Actual filtering belongs to the Projects and Calendar modules. |
| `DG-TYP-006` / `FUP-013` | Scott approved the implemented rule: deletion is blocked while Projects use the type. The dialog explains the reason and confirms that nothing changed. |

## Routes

| Route | Purpose | Access/state |
| --- | --- | --- |
| `/settings` | Settings entry | Redirects to `/settings/project-types`. |
| `/settings/project-types` | Project Types management | Signed-out Users redirect to Login. Admins receive the full UI. Employees receive a restricted-access screen with no Project Type data. The final Owner role will receive the same management UI. |

## Main-screen states

1. **Default list:** Three client-supplied example types—Acrylic, Hardwood, and Modular—with Project usage and last-updated information.
2. **Search results:** Case-insensitive name filtering.
3. **No matching results:** Explains that no name matches and provides a **Clear search** action.
4. **Responsive list:** Desktop uses a table. Narrow screens use stacked cards so actions do not require horizontal scrolling.
5. **Success notice:** Create, rename, and delete actions produce a short accessible status message.
6. **Restricted access:** Explains that only an Owner or Admin may manage Project Types and provides a route back to All Projects.

## Dialogs and confirmations

### Add Project Type

- Required, focused **Project Type name** field.
- Example placeholder uses the approved Acrylic terminology.
- Visible 50-character counter and validation rule.
- Empty, overlength, and duplicate-name errors.
- **Cancel**, close icon, backdrop click, and Escape all request a safe close.
- If the name has changed, closing opens **Discard unsaved changes?**.

### Rename Project Type

- Opens with the current name selected for editing.
- Explains that the new name will appear in All Projects and Master Calendar filters.
- Confirms that existing Projects remain assigned.
- Uses the same validation and unsaved-change protection as Add.

### Delete an unused Project Type

- Opens **Delete Project Type?** only when zero Projects use the type.
- Names the exact type and states that deletion cannot be undone.
- **Cancel** is initially focused.
- **Delete Project Type** removes only the UI demonstration item and shows a success notice.

### Attempt to delete an in-use Project Type

- Opens **This Project Type can't be deleted**.
- Names the type and exact number of affected Projects.
- Tells the User to reassign those Projects first.
- Explicitly confirms that no Project or schedule changed.
- Provides no destructive action.

### Discard unsaved changes

- Opens when a User closes a changed Add/Rename form.
- **Keep editing** returns to the existing draft.
- **Discard changes** closes the editor without adding or renaming a type.

## Keyboard and accessibility behavior

- Dialogs identify themselves with `dialog` or `alertdialog`, an accessible title, description, and modal state.
- Add/Rename places keyboard focus in the name field.
- Escape closes clean dialogs and requests confirmation for changed forms.
- All icon-only buttons have accessible names.
- Form errors use an alert and are associated with the name field.
- Success messages use a polite live region.
- Buttons and inputs have visible focus rings and 44-pixel minimum interactive height for primary actions.

## Data wiring intentionally deferred

The UI currently keeps its demonstration state in the browser. Production persistence requires the approved database migration, tenant-scoped Project Type API, Project foreign key, Project create/edit integration, All Projects filters, Master Calendar filters, and server-side role enforcement. Those are outside this UI-only module.

## QA loop

The module is accepted for UI review only after:

1. The production build and TypeScript checks pass.
2. Foundation and authenticated scenario tests pass.
3. Playwright exercises create, validation, rename, search, both deletion paths, unsaved-change protection, access restriction, keyboard behavior, and mobile overflow.
4. A human-style click pass repeats the important workflows in a visible browser.
5. Any discovered defect or gap is fixed and the affected checks are repeated.
