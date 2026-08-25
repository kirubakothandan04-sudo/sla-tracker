# Support Ticket & SLA Tracker

A full stack support ticket management system with business-hour SLA tracking, built for the Support Ticket & SLA Tracker take-home assignment.

The application allows reporters to create tickets and support agents to assign, manage, comment on, and resolve them while automatically calculating SLA deadlines based on business hours, weekends, and holidays.


 Tech Stack

Backend
- Bun
- TypeScript
- GraphQL Yoga
- Prisma ORM
- PostgreSQL
- Docker Compose
- JWT authentication

Frontend
- React
- TypeScript
- Vite

Testing
- Bun Test
- Unit tests
- Integration tests with real PostgreSQL

---

## Features

- JWT-based authentication
- Reporter and Agent roles
- Ticket creation and management
- Priority levels: Low, Medium, High, Urgent
- Ticket lifecycle management
- Agent assignment
- Ticket comments
- First-response tracking
- Business-hour SLA calculation
- Weekend and holiday handling
- SLA states: On Track, At Risk, Breached
- Ticket filtering
- Cursor-based pagination
- SLA dashboard
- Responsive frontend
- Server-side validation and authorization
- Unit and PostgreSQL integration tests


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