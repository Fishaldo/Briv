# Working on Briv

Read README.md first. The product rules there are not optional.

- Briv sets the standard; Pence copies Briv's `packages/core`, never the other way round. Fix logic here, then sync Pence.
- Briv is the working name and may change; README.md says where the name lives. Pounds and Britain first. Mobile first.
- Screens stay short and plain: many people using Briv read English as a second language.
- Never invent an offer's price, code or end date. Show them only when a public page states them.
- Private data is read and written only through `apps/api/src/data` (`forPerson`), which is scoped to the signed-in person. Routes cannot import tables; lint enforces it.
- Request checks and answer types live in `packages/contract`, shared by the app and the server.
- Logs and error reports never carry what someone typed, a name, an email or an amount: use `safeError`.
- Pure logic goes in `packages/core` with a test next to it. Run `pnpm check` before you finish.
- The database changes only through `packages/db/src/schema.ts` plus a generated migration.
- In `apps/app`, follow apps/app/AGENTS.md: Expo changes often, so check the docs for the SDK in package.json.
