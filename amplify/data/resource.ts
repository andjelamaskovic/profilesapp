import { type ClientSchema, a, defineData } from '@aws-amplify/backend';
import { postConfirmation } from "../auth/post-confirmation/resource";

const schema = a
    .schema({
      UserProfile: a
          .model({
            email: a.string(),
            profileOwner: a.string(),
          })
          .authorization((allow) => [
            allow.ownerDefinedIn("profileOwner"),
          ]),
        Transaction: a
            .model({
                amount: a.float().required(),
                type: a.string().required(),
                description: a.string(),
                date: a.datetime().required(),
                categoryId: a.id(),
                category: a.belongsTo("Category", "categoryId"),
            })
            .authorization((allow) => [
                allow.owner(),
                allow.publicApiKey()
            ]),
        Category: a
            .model({
                name: a.string().required(),
                color: a.string(),  // opcionalno (npr. #34a853)
                icon: a.string(),   // opcionalno (npr. "🍔" ili "food")
                transactions: a.hasMany("Transaction", "categoryId"),

            })
            .authorization((allow) => [
                allow.owner(),
                allow.publicApiKey()
// svaka kategorija pripada vlasniku
            ]),
        SavingsConfig : a.model({
            monthlyTarget: a.float().required(),
            yearlyTarget: a.float(),
        }).authorization((allow) => [
            allow.owner(),
            allow.publicApiKey()
        ]),
        Bill: a
            .model({
                name: a.string().required(),
                amount: a.float().required(),
                dueDay: a.integer().required(),
                categoryId: a.id(),
                active: a.boolean().default(true),
                paidMonths: a.string().array(),
                lastPaidMonth: a.string(),
            })
            .authorization((allow) => [
                allow.owner(),
                allow.publicApiKey()
            ]),
        IncomeSource: a
            .model({
                name: a.string().required(),
                amount: a.float().required(),
                payDay: a.integer().required(),
                categoryId: a.id(),
                active: a.boolean().default(true),
                receivedMonths: a.string().array(),

                lastReceivedMonth: a.string(),
            })
            .authorization((allow) => [
                allow.owner(),
                allow.publicApiKey()
            ]),



    })
    .authorization((allow) => [allow.resource(postConfirmation)]);
export type Schema = ClientSchema<typeof schema>;
export const data = defineData({
  schema,
  authorizationModes: {
    defaultAuthorizationMode: "apiKey",
    apiKeyAuthorizationMode: {
      expiresInDays: 30,
    },
  },
});
/*== STEP 2 ===============================================================
Go to your frontend source code. From your client-side code, generate a
Data client to make CRUDL requests to your table. (THIS SNIPPET WILL ONLY
WORK IN THE FRONTEND CODE FILE.)

Using JavaScript or Next.js React Server Components, Middleware, Server 
Actions or Pages Router? Review how to generate Data clients for those use
cases: https://docs.amplify.aws/gen2/build-a-backend/data/connect-to-API/
=========================================================================*/

/*
"use client"
import { generateClient } from "aws-amplify/data";
import type { Schema } from "@/amplify/data/resource";

const client = generateClient<Schema>() // use this Data client for CRUDL requests
*/

/*== STEP 3 ===============================================================
Fetch records from the database and use them in your frontend component.
(THIS SNIPPET WILL ONLY WORK IN THE FRONTEND CODE FILE.)
=========================================================================*/

/* For example, in a React component, you can use this snippet in your
  function's RETURN statement */
// const { data: todos } = await client.models.Todo.list()

// return <ul>{todos.map(todo => <li key={todo.id}>{todo.content}</li>)}</ul>
