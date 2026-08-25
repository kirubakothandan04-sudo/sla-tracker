Support Ticket & SLA Tracker — Implementation Walkthrough
1. Overview
I built a Support Ticket & SLA Tracker that allows users to raise support tickets and support agents to manage, assign, comment on, and resolve them.

The application also calculates SLA deadlines based on business hours and tracks whether tickets are On Track, At Risk, or Breached.

The implementation uses the required technology stack:

Bun + TypeScript
GraphQL Yoga
PostgreSQL
Prisma
Docker Compose
React + TypeScript

2. Architecture
The application is divided into a backend and frontend.
The backend follows a layered structure:
React Frontend
      |
      | GraphQL
      ↓
GraphQL Yoga
      |
      ↓
Resolvers
      |
      ↓
Service Layer
      |
      ├── Ticket Business Logic
      ├── SLA Calculation
      ├── Validation
      └── Authentication / Authorization
      |
      ↓
Prisma
      |
      ↓
PostgreSQL

GraphQL schemas are defined using .graphql files, with resolvers implementing the operations.
The service layer contains the main business logic so that it is not tightly coupled to the GraphQL layer.

3. Authentication and Authorization
The application uses JWT-based authentication.
There are two roles:
Reporter
Reporters can:
Create tickets
View tickets
Add comments
Agent
Agents can:
View tickets
Assign tickets
Change ticket status
Resolve tickets
Add comments
Authorization is enforced server-side. This prevents users from bypassing permissions by directly calling the GraphQL API.

4. Ticket Lifecycle
Tickets support the following lifecycle:
OPEN
  ↓
IN_PROGRESS
  ↓
RESOLVED
  ↓
CLOSED
Status transitions are validated on the server.
For example, a ticket cannot be moved from CLOSED directly to IN_PROGRESS.

Invalid transitions return a meaningful GraphQL error with an appropriate error code.
5. Ticket Creation and Management
A reporter can create a ticket with:
Title
Description
Priority
Available priorities are:
LOW
MEDIUM
HIGH
URGENT
Agents can then assign the ticket, update its status, add comments, and resolve it.
The frontend provides a dashboard where tickets can be searched and filtered.

6. SLA Calculation
The SLA engine is one of the main business-logic components of the application.
SLA deadlines are calculated using business minutes rather than normal elapsed time.
The configured business hours are:
09:00 – 18:00
Monday – Friday
Timezone: Asia/Kolkata
The calculation handles:
Tickets created before business hours
Tickets created after business hours
Weekends
Configured holidays
Multi-day SLA calculations
First-response deadlines
Resolution deadlines
The calculation moves the timestamp into the next valid business period whenever necessary and only counts valid business minutes.

7. SLA States
Each ticket exposes SLA information through GraphQL.
The possible SLA states are:
ON_TRACK
AT_RISK
BREACHED
A ticket becomes AT_RISK once more than 75% of its SLA budget has been consumed.
A ticket becomes BREACHED after its SLA deadline has passed.
Completed SLA clocks are frozen so that a completed ticket does not become breached later.

8. First Response Tracking
Comments are associated with the user who created them.
A reporter's comment does not count as the support team's first response.
When an agent makes the first response, the ticket records the firstResponseAt timestamp.
This allows first-response SLA tracking to accurately distinguish customer activity from an agent response.

9. Database
PostgreSQL is used as the application's database and runs through Docker Compose.
Prisma is responsible for:
Database modeling
Database queries
Migrations
Seed data
The project contains committed Prisma migrations so that the database can be recreated consistently.
The seed data provides users, tickets and other sample data for development and testing.

10. GraphQL API
The backend uses a schema-first GraphQL implementation with GraphQL Yoga.
The main operations include:
Queries
tickets
ticket
dashboard
users
me
holidays
Mutations
register
login
createTicket
assignTicket
changeTicketStatus
resolveTicket
addComment
The ticket query supports filtering and cursor-based pagination.
Tickets can be filtered by relevant criteria such as:
Status
Priority
Assignee
SLA state

11. Frontend
The frontend is built with React and TypeScript.
The dashboard provides:
Ticket statistics
Ticket list
Search
Filtering
Ticket creation
Assignment
Status management
Comments
SLA information
The frontend communicates with the backend through GraphQL and uses the authentication 
token for protected operations.

12. Validation and Error Handling
Input validation and business rules are implemented on the server.
Examples include:
Empty ticket titles are rejected.
Empty descriptions are rejected.
Invalid priorities are rejected.
Empty comments are rejected.
Unauthorized operations are rejected.
Invalid ticket status transitions are rejected.
GraphQL errors include meaningful error codes such as:
FORBIDDEN
INVALID_STATUS_TRANSITION
INVALID_COMMENT
INVALID_PRIORITY
This allows the frontend to provide appropriate feedback to users.

13. Testing
The backend contains both unit and integration tests.
The tests cover important SLA and ticket scenarios including:
Business-hour calculations
Before-business-hours tickets
After-business-hours tickets
Weekend handling
Holiday handling
Weekend and holiday combinations
Multi-day SLA calculations
SLA state boundaries
SLA breaches
Completed SLA behavior
Ticket lifecycle
First-response tracking
PostgreSQL integration
The final backend verification produced:
20 tests passed
0 tests failed
36 expectations
TypeScript compilation and ESLint checks also pass successfully.

14. Development Setup
PostgreSQL can be started using:
docker compose up -d
Backend setup:
cd backend
bun install
bunx prisma migrate dev
bunx prisma db seed
bun run dev
Frontend setup:
cd frontend
bun install
bun run dev
The frontend runs at:
http://localhost:5173
The GraphQL API runs at:
http://localhost:4000/graphql
Environment configuration examples are provided through:
backend/.env.example
frontend/.env.example
Real credentials and secrets are not committed to the repository.

15. Testing the Main Flow
A complete ticket workflow can be tested as follows:
Reporter Login
      ↓
Create Ticket
      ↓
Agent Login
      ↓
Assign Ticket
      ↓
Add Agent Comment
      ↓
OPEN → IN_PROGRESS
      ↓
RESOLVED
      ↓
CLOSED
During this flow, the SLA information and first-response timestamp can also be verified.

16. Engineering Decisions
I focused on keeping the implementation simple and maintainable instead of adding unnecessary infrastructure.
The main decisions were:
Keep business rules on the server.
Separate GraphQL resolvers from business logic.
Use Prisma for structured database access.
Use business-minute calculations for SLA handling.
Use server-side role-based authorization.
Cover important edge cases with automated tests.
Use Docker Compose for reproducible PostgreSQL development.
Keep the frontend focused on the required ticket-management workflow.

17. Tradeoffs and Future Improvements
For the scope of the assignment, I avoided introducing additional infrastructure such as microservices, message queues, or external notification systems.
If this application were extended further, I would consider:
SLA breach notifications
Background SLA monitoring
Audit/event history
Email notifications
Configurable business hours per organization
More detailed reporting
Additional end-to-end frontend tests

18. Conclusion
The implementation focuses on the core requirements of the assignment while keeping the architecture understandable and maintainable.
The main areas of focus were GraphQL API design, database modeling, authentication and authorization, SLA business logic, validation, testing, and a functional React frontend.


## Architecture


                    React + TypeScript
                           |
                           | GraphQL
                           v
                    GraphQL Yoga API
                           |
                           v
                       Resolvers
                           |
                           v
                    Service Layer

                    /           \
                   /             \
            Ticket Logic       SLA Engine
                   \             /
                    \           /
                       Prisma
                          |
                          v
                      PostgreSQL