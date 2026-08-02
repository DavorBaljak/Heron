import { createMockLoxoneServer } from "./server.js";

const port = Number(process.env.PORT ?? 8080);
createMockLoxoneServer().listen(port, () => {
  console.log(`loxone-mock listening on http://localhost:${port}`);
});
