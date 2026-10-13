# Working on Briv

Read README.md first. The product rules there are not optional.

- Briv is the working name and may change; README.md says where the name lives. Pounds and Britain first. Mobile first.
- Screens stay short and plain: many people using Briv read English as a second language.
- Never invent an offer's price, code or end date. Show them only when a public page states them.
- Every query on private data is scoped to the signed-in person's number (`c.var.personId` in the server).
- Pure logic goes in `packages/core` with a test next to it. Run `pnpm check` before you finish.
- The database changes only through `packages/db/src/schema.ts` plus a generated migration.
- In `apps/app`, follow apps/app/AGENTS.md: Expo changes often, so check the docs for the SDK in package.json.
