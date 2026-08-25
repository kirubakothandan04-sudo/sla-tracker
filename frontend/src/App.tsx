import { useEffect, useMemo, useState, type FormEvent } from "react";
import { gql } from "graphql-request";
import {
  clearAuth,
  getClient,
  isAuthenticated,
  saveAuth,
} from "./api";
import "./App.css";

type Role = "REPORTER" | "AGENT";
type Priority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";
type TicketStatus = "OPEN" | "IN_PROGRESS" | "RESOLVED" | "CLOSED";
type SLAState = "ON_TRACK" | "AT_RISK" | "BREACHED";

interface User {
  id: string;
  name: string;
  email: string;
  role: Role;
  createdAt?: string;
}

interface SLA {
  firstResponseDueAt: string;
  resolutionDueAt: string;
  firstResponseState: SLAState;
  resolutionState: SLAState;
  firstResponseRemainingMinutes: number;
  resolutionRemainingMinutes: number;
}

interface Comment {
  id: string;
  ticketId: string;
  content: string;
  createdAt: string;
  author: User;
}

interface Ticket {
  id: string;
  title: string;
  description: string;
  priority: Priority;
  status: TicketStatus;
  reporter: User;
  assignee: User | null;
  createdAt: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  sla: SLA;
  comments: Comment[];
}

interface TicketsResponse {
  tickets: {
    nodes: Ticket[];
    pageInfo: {
      hasNextPage: boolean;
      endCursor: string | null;
    };
  };
}

interface DashboardResponse {
  dashboard: {
    openTickets: number;
    inProgressTickets: number;
    atRiskTickets: number;
    breachedTickets: number;
  };
}

interface UsersResponse {
  users: User[];
}

interface AuthResponse {
  login: {
    token: string;
    user: User;
  };
}

interface MeResponse {
  me: User | null;
}

const LOGIN_MUTATION = gql`
  mutation Login($email: String!, $password: String!) {
    login(email: $email, password: $password) {
      token
      user {
        id
        name
        email
        role
      }
    }
  }
`;

const ME_QUERY = gql`
  query Me {
    me {
      id
      name
      email
      role
      createdAt
    }
  }
`;

const DASHBOARD_QUERY = gql`
  query Dashboard {
    dashboard {
      openTickets
      inProgressTickets
      atRiskTickets
      breachedTickets
    }
  }
`;

const TICKETS_QUERY = gql`
  query Tickets {
    tickets(take: 50) {
      nodes {
        id
        title
        description
        priority
        status
        createdAt
        firstResponseAt
        resolvedAt
        reporter {
          id
          name
          email
          role
        }
        assignee {
          id
          name
          email
          role
        }
        sla {
          firstResponseDueAt
          resolutionDueAt
          firstResponseState
          resolutionState
          firstResponseRemainingMinutes
          resolutionRemainingMinutes
        }
        comments {
          id
          ticketId
          content
          createdAt
          author {
            id
            name
            email
            role
          }
        }
      }
      pageInfo {
        hasNextPage
        endCursor
      }
    }
  }
`;

const USERS_QUERY = gql`
  query Users {
    users(role: AGENT) {
      id
      name
      email
      role
      createdAt
    }
  }
`;

const CREATE_TICKET_MUTATION = gql`
  mutation CreateTicket(
    $title: String!
    $description: String!
    $priority: Priority!
  ) {
    createTicket(
      title: $title
      description: $description
      priority: $priority
    ) {
      id
    }
  }
`;

const ASSIGN_MUTATION = gql`
  mutation AssignTicket($ticketId: ID!, $assigneeId: ID!) {
    assignTicket(ticketId: $ticketId, assigneeId: $assigneeId) {
      id
    }
  }
`;

const STATUS_MUTATION = gql`
  mutation ChangeTicketStatus($ticketId: ID!, $status: TicketStatus!) {
    changeTicketStatus(ticketId: $ticketId, status: $status) {
      id
      status
      resolvedAt
    }
  }
`;

const COMMENT_MUTATION = gql`
  mutation AddComment($ticketId: ID!, $content: String!) {
    addComment(ticketId: $ticketId, content: $content) {
      id
      content
      createdAt
      author {
        id
        name
        email
        role
      }
    }
  }
`;

function formatMinutes(minutes: number) {
  if (minutes <= 0) return "Due";

  const days = Math.floor(minutes / 1440);
  const hours = Math.floor((minutes % 1440) / 60);
  const mins = minutes % 60;

  if (days > 0) return `${days}d ${hours}h`;
  if (hours > 0) return `${hours}h ${mins}m`;
  return `${mins}m`;
}

function formatDate(value: string | null | undefined) {
  if (!value) return "—";

  return new Date(value).toLocaleString([], {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

function statusLabel(status: TicketStatus) {
  return status.replace("_", " ");
}

function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [loginLoading, setLoginLoading] = useState(false);
  const [error, setError] = useState("");

  const [email, setEmail] = useState("agent@example.com");
  const [password, setPassword] = useState("password123");

  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [dashboard, setDashboard] =
    useState<DashboardResponse["dashboard"] | null>(null);
  const [agents, setAgents] = useState<User[]>([]);

  const [selectedTicket, setSelectedTicket] = useState<Ticket | null>(null);

  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | TicketStatus>("ALL");
  const [priorityFilter, setPriorityFilter] =
    useState<"ALL" | Priority>("ALL");
  const [slaFilter, setSlaFilter] = useState<"ALL" | SLAState>("ALL");

  const [actionLoading, setActionLoading] = useState(false);
  const [comment, setComment] = useState("");

  const [showCreate, setShowCreate] = useState(false);
  const [newTitle, setNewTitle] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newPriority, setNewPriority] = useState<Priority>("MEDIUM");

  const [toast, setToast] = useState<{
    type: "success" | "error";
    message: string;
  } | null>(null);

  const client = getClient();

  function showToast(
    message: string,
    type: "success" | "error" = "success",
  ) {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3000);
  }

  async function loadData() {
    try {
      setError("");

      const [ticketResult, dashboardResult, usersResult] = await Promise.all([
        client.request<TicketsResponse>(TICKETS_QUERY),
        client.request<DashboardResponse>(DASHBOARD_QUERY),
        client.request<UsersResponse>(USERS_QUERY),
      ]);

      setTickets(ticketResult.tickets.nodes);
      setDashboard(dashboardResult.dashboard);
      setAgents(usersResult.users);

      if (selectedTicket) {
        const updated = ticketResult.tickets.nodes.find(
          (ticket) => ticket.id === selectedTicket.id,
        );

        if (updated) setSelectedTicket(updated);
      }
    } catch (err) {
      console.error(err);
      setError("Unable to load support data.");
    }
  }

  useEffect(() => {
    async function initialize() {
      if (!isAuthenticated()) {
        setLoading(false);
        return;
      }

      try {
        const result = await client.request<MeResponse>(ME_QUERY);
        setUser(result.me);

        if (result.me) {
          await loadData();
        }
      } catch (err) {
        console.error(err);
        clearAuth();
        setUser(null);
      } finally {
        setLoading(false);
      }
    }

    void initialize();
  }, []);

  async function handleLogin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    try {
      setLoginLoading(true);
      setError("");

      const result = await client.request<AuthResponse>(LOGIN_MUTATION, {
        email,
        password,
      });

      saveAuth(result.login.token);
      setUser(result.login.user);

      showToast(`Welcome back, ${result.login.user.name}`);
      await loadData();
    } catch (err) {
      console.error(err);
      setError("Invalid email or password.");
    } finally {
      setLoginLoading(false);
      setLoading(false);
    }
  }

  function handleLogout() {
    clearAuth();
    setUser(null);
    setTickets([]);
    setDashboard(null);
    setSelectedTicket(null);
  }

  async function refresh() {
    await loadData();
    showToast("Dashboard refreshed");
  }

  async function changeStatus(status: TicketStatus) {
    if (!selectedTicket) return;

    try {
      setActionLoading(true);

      await client.request(STATUS_MUTATION, {
        ticketId: selectedTicket.id,
        status,
      });

      await loadData();

      showToast(`Ticket moved to ${statusLabel(status)}`);
    } catch (err) {
      console.error(err);

      const message =
        err instanceof Error ? err.message : "Unable to change ticket status.";

      showToast(message, "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function assignTicket() {
    if (!selectedTicket || !selectedTicket.assignee) return;

    try {
      setActionLoading(true);

      await client.request(ASSIGN_MUTATION, {
        ticketId: selectedTicket.id,
        assigneeId: selectedTicket.assignee.id,
      });

      await loadData();
      showToast(`Assigned to ${selectedTicket.assignee.name}`);
    } catch (err) {
      console.error(err);
      showToast("Unable to assign ticket.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function addComment() {
    if (!selectedTicket || !comment.trim()) return;

    try {
      setActionLoading(true);

      await client.request(COMMENT_MUTATION, {
        ticketId: selectedTicket.id,
        content: comment.trim(),
      });

      setComment("");
      await loadData();
      showToast("Comment added");
    } catch (err) {
      console.error(err);
      showToast("Unable to add comment.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  async function createTicket(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!newTitle.trim() || !newDescription.trim()) return;

    try {
      setActionLoading(true);

      await client.request(CREATE_TICKET_MUTATION, {
        title: newTitle.trim(),
        description: newDescription.trim(),
        priority: newPriority,
      });

      setNewTitle("");
      setNewDescription("");
      setNewPriority("MEDIUM");
      setShowCreate(false);

      await loadData();
      showToast("Ticket created");
    } catch (err) {
      console.error(err);
      showToast("Unable to create ticket.", "error");
    } finally {
      setActionLoading(false);
    }
  }

  const filteredTickets = useMemo(() => {
    const query = search.trim().toLowerCase();

    return tickets.filter((ticket) => {
      const matchesSearch =
        !query ||
        ticket.title.toLowerCase().includes(query) ||
        ticket.id.toLowerCase().includes(query) ||
        ticket.description.toLowerCase().includes(query);

      const matchesStatus =
        statusFilter === "ALL" || ticket.status === statusFilter;

      const matchesPriority =
        priorityFilter === "ALL" || ticket.priority === priorityFilter;

      const matchesSla =
        slaFilter === "ALL" ||
        ticket.sla.firstResponseState === slaFilter ||
        ticket.sla.resolutionState === slaFilter;

      return (
        matchesSearch &&
        matchesStatus &&
        matchesPriority &&
        matchesSla
      );
    });
  }, [tickets, search, statusFilter, priorityFilter, slaFilter]);

  if (loading) {
    return (
      <div className="loading-screen">
        <div className="spinner" />
        <p>Loading SLA Tracker...</p>
      </div>
    );
  }

  if (!user) {
    return (
      <main className="login-page">
        <section className="login-card">
          <div className="brand-mark">S</div>

          <p className="eyebrow">SECURE ACCESS</p>
          <h1>SLA Tracker</h1>
          <p className="login-subtitle">
            Support operations workspace
          </p>

          <form onSubmit={handleLogin}>
            <label>
              Email
              <input
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                type="email"
                required
              />
            </label>

            <label>
              Password
              <input
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                type="password"
                required
              />
            </label>

            {error && <div className="error-box">{error}</div>}

            <button className="primary-button full" disabled={loginLoading}>
              {loginLoading ? "Signing in..." : "Sign in"}
            </button>
          </form>

          <div className="demo-box">
            <strong>Demo access</strong>
            <span>agent@example.com</span>
            <span>password123</span>
          </div>
        </section>
      </main>
    );
  }

  return (
    <div className="app-shell">
      {toast && (
        <div className={`toast ${toast.type}`}>
          {toast.type === "success" ? "✓" : "!"} {toast.message}
        </div>
      )}

      <header className="topbar">
        <div className="brand">
          <div className="brand-mark small">S</div>
          <div>
            <strong>SLA Tracker</strong>
            <span>Support operations</span>
          </div>
        </div>

        <div className="user-menu">
          <div>
            <strong>{user.name}</strong>
            <span>{user.role}</span>
          </div>

          <button className="secondary-button" onClick={handleLogout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard">
        <section className="hero">
          <div>
            <p className="eyebrow">OVERVIEW</p>
            <h1>Support dashboard</h1>
            <p>Monitor tickets and SLA health in real time.</p>
          </div>

          <div className="hero-actions">
            {user.role === "REPORTER" && (
              <button
                className="primary-button"
                onClick={() => setShowCreate(true)}
              >
                + New ticket
              </button>
            )}

            <button
              className="secondary-button"
              onClick={() => void refresh()}
            >
              Refresh
            </button>
          </div>
        </section>

        {error && <div className="error-box">{error}</div>}

        <section className="stats-grid">
          <StatCard
            label="Open tickets"
            value={dashboard?.openTickets ?? 0}
            detail="Awaiting action"
          />
          <StatCard
            label="In progress"
            value={dashboard?.inProgressTickets ?? 0}
            detail="Currently handled"
          />
          <StatCard
            label="At risk"
            value={dashboard?.atRiskTickets ?? 0}
            detail="SLA needs attention"
            danger={Boolean(dashboard?.atRiskTickets)}
          />
          <StatCard
            label="Breached"
            value={dashboard?.breachedTickets ?? 0}
            detail="Past SLA target"
            danger={Boolean(dashboard?.breachedTickets)}
          />
        </section>

        <section className="toolbar">
          <div className="search-box">
            <span>⌕</span>
            <input
              placeholder="Search tickets..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
          </div>

          <select
            value={statusFilter}
            onChange={(event) =>
              setStatusFilter(
                event.target.value as "ALL" | TicketStatus,
              )
            }
          >
            <option value="ALL">All statuses</option>
            <option value="OPEN">Open</option>
            <option value="IN_PROGRESS">In progress</option>
            <option value="RESOLVED">Resolved</option>
            <option value="CLOSED">Closed</option>
          </select>

          <select
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(
                event.target.value as "ALL" | Priority,
              )
            }
          >
            <option value="ALL">All priorities</option>
            <option value="LOW">Low</option>
            <option value="MEDIUM">Medium</option>
            <option value="HIGH">High</option>
            <option value="URGENT">Urgent</option>
          </select>

          <select
            value={slaFilter}
            onChange={(event) =>
              setSlaFilter(event.target.value as "ALL" | SLAState)
            }
          >
            <option value="ALL">All SLA states</option>
            <option value="ON_TRACK">On track</option>
            <option value="AT_RISK">At risk</option>
            <option value="BREACHED">Breached</option>
          </select>
        </section>

        <section className="ticket-section">
          <div className="section-header">
            <div>
              <p className="eyebrow">WORK QUEUE</p>
              <h2>Tickets</h2>
              <p>Latest support requests and SLA status.</p>
            </div>

            <span className="result-count">
              {filteredTickets.length} shown
            </span>
          </div>

          {filteredTickets.length === 0 ? (
            <div className="empty-state">
              <div>✓</div>
              <h3>No tickets found</h3>
              <p>Try changing your filters or search.</p>
            </div>
          ) : (
            <div className="ticket-list">
              {filteredTickets.map((ticket) => (
                <button
                  key={ticket.id}
                  className="ticket-row"
                  onClick={() => setSelectedTicket(ticket)}
                >
                  <div className="ticket-main">
                    <strong>{ticket.title}</strong>
                    <span>
                      #{ticket.id.slice(0, 10)} ·{" "}
                      {formatDate(ticket.createdAt)}
                    </span>
                  </div>

                  <PriorityBadge priority={ticket.priority} />

                  <StatusBadge status={ticket.status} />

                  <div className="assignee">
                    {ticket.assignee ? (
                      <>
                        <div className="avatar">
                          {ticket.assignee.name.charAt(0)}
                        </div>
                        <span>{ticket.assignee.name}</span>
                      </>
                    ) : (
                      <span className="muted">Unassigned</span>
                    )}
                  </div>

                  <div className="sla-summary">
                    <SlaBadge state={ticket.sla.resolutionState} />
                    <small>
                      {formatMinutes(
                        ticket.sla.resolutionRemainingMinutes,
                      )}{" "}
                      remaining
                    </small>
                  </div>
                </button>
              ))}
            </div>
          )}
        </section>
      </main>

      {selectedTicket && (
        <TicketModal
          ticket={selectedTicket}
          agents={agents}
          user={user}
          comment={comment}
          setComment={setComment}
          actionLoading={actionLoading}
          onClose={() => setSelectedTicket(null)}
          onAssign={assignTicket}
          onStatus={changeStatus}
          onComment={addComment}
        />
      )}

      {showCreate && (
        <div className="modal-backdrop">
          <div className="modal create-modal">
            <button
              className="modal-close"
              onClick={() => setShowCreate(false)}
            >
              ×
            </button>

            <p className="eyebrow">NEW REQUEST</p>
            <h2>Create ticket</h2>

            <form onSubmit={createTicket}>
              <label>
                Title
                <input
                  value={newTitle}
                  onChange={(event) => setNewTitle(event.target.value)}
                  placeholder="Describe the issue"
                  required
                />
              </label>

              <label>
                Description
                <textarea
                  value={newDescription}
                  onChange={(event) =>
                    setNewDescription(event.target.value)
                  }
                  placeholder="Give the support team more details..."
                  rows={6}
                  required
                />
              </label>

              <label>
                Priority
                <select
                  value={newPriority}
                  onChange={(event) =>
                    setNewPriority(event.target.value as Priority)
                  }
                >
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="URGENT">Urgent</option>
                </select>
              </label>

              <button
                className="primary-button full"
                disabled={actionLoading}
              >
                {actionLoading ? "Creating..." : "Create ticket"}
              </button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  detail,
  danger = false,
}: {
  label: string;
  value: number;
  detail: string;
  danger?: boolean;
}) {
  return (
    <div className={`stat-card ${danger ? "danger" : ""}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </div>
  );
}

function PriorityBadge({ priority }: { priority: Priority }) {
  return <span className={`priority ${priority.toLowerCase()}`}>{priority}</span>;
}

function StatusBadge({ status }: { status: TicketStatus }) {
  return (
    <span className={`status ${status.toLowerCase()}`}>
      {statusLabel(status)}
    </span>
  );
}

function SlaBadge({ state }: { state: SLAState }) {
  return <span className={`sla-badge ${state.toLowerCase()}`}>{state.replace("_", " ")}</span>;
}

function TicketModal({
  ticket,
  agents,
  user,
  comment,
  setComment,
  actionLoading,
  onClose,
  onAssign,
  onStatus,
  onComment,
}: {
  ticket: Ticket;
  agents: User[];
  user: User;
  comment: string;
  setComment: (value: string) => void;
  actionLoading: boolean;
  onClose: () => void;
  onAssign: () => void;
  onStatus: (status: TicketStatus) => void;
  onComment: () => void;
}) {
  const [selectedAgent, setSelectedAgent] = useState(
    ticket.assignee?.id ?? "",
  );

  const selectedAgentObject =
    agents.find((agent) => agent.id === selectedAgent) ?? null;

  const activity = [
    {
      title: "Ticket created",
      detail: `Reported by ${ticket.reporter.name}`,
      date: ticket.createdAt,
    },
    ...(ticket.assignee
      ? [
          {
            title: "Assigned",
            detail: `Assigned to ${ticket.assignee.name}`,
            date: ticket.createdAt,
          },
        ]
      : []),
    ...(ticket.firstResponseAt
      ? [
          {
            title: "First response",
            detail: "Agent response recorded",
            date: ticket.firstResponseAt,
          },
        ]
      : []),
    ...ticket.comments.map((item) => ({
      title: item.author.name,
      detail: item.content,
      date: item.createdAt,
    })),
    ...(ticket.resolvedAt
      ? [
          {
            title: "Resolved",
            detail: "Ticket resolution recorded",
            date: ticket.resolvedAt,
          },
        ]
      : []),
  ];

  return (
    <div className="modal-backdrop">
      <div className="modal ticket-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>

        <div className="ticket-modal-header">
          <div>
            <p className="eyebrow">TICKET DETAILS</p>
            <h2>{ticket.title}</h2>
            <span className="ticket-id">#{ticket.id}</span>
          </div>

          <div className="modal-status">
            <PriorityBadge priority={ticket.priority} />
            <StatusBadge status={ticket.status} />
          </div>
        </div>

        <div className="detail-grid">
          <div>
            <span>Reporter</span>
            <strong>{ticket.reporter.name}</strong>
          </div>

          <div>
            <span>Assignee</span>
            <strong>{ticket.assignee?.name ?? "Unassigned"}</strong>
          </div>

          <div>
            <span>Created</span>
            <strong>{formatDate(ticket.createdAt)}</strong>
          </div>

          <div>
            <span>Resolved</span>
            <strong>{formatDate(ticket.resolvedAt)}</strong>
          </div>
        </div>

        <div className="description">
          <h3>Description</h3>
          <p>{ticket.description}</p>
        </div>

        <div className="sla-panel">
          <div className="panel-heading">
            <h3>SLA health</h3>
            <span>
              {ticket.sla.resolutionState === "BREACHED"
                ? "Immediate attention required"
                : "Within target"}
            </span>
          </div>

          <div className="sla-grid">
            <div className={`sla-card ${ticket.sla.firstResponseState.toLowerCase()}`}>
              <span>First response</span>
              <strong>{ticket.sla.firstResponseState}</strong>
              <b>
                {formatMinutes(
                  ticket.sla.firstResponseRemainingMinutes,
                )}{" "}
                remaining
              </b>
            </div>

            <div className={`sla-card ${ticket.sla.resolutionState.toLowerCase()}`}>
              <span>Resolution</span>
              <strong>{ticket.sla.resolutionState}</strong>
              <b>
                {formatMinutes(
                  ticket.sla.resolutionRemainingMinutes,
                )}{" "}
                remaining
              </b>
            </div>
          </div>
        </div>

        {user.role === "AGENT" && (
          <div className="agent-actions">
            <h3>Agent actions</h3>

            <div className="assign-row">
              <select
                value={selectedAgent}
                onChange={(event) => setSelectedAgent(event.target.value)}
              >
                <option value="">Select agent</option>
                {agents.map((agent) => (
                  <option key={agent.id} value={agent.id}>
                    {agent.name}
                  </option>
                ))}
              </select>

              <button
                className="secondary-button"
                disabled={!selectedAgentObject || actionLoading}
                onClick={() => {
                  if (!selectedAgentObject) return;

                  ticket.assignee = selectedAgentObject;
                  void onAssign();
                }}
              >
                Assign
              </button>
            </div>

            <div className="status-actions">
              <button
                className={ticket.status === "OPEN" ? "active" : ""}
                disabled={actionLoading || ticket.status === "OPEN"}
                onClick={() => void onStatus("OPEN")}
              >
                Open
              </button>

              <button
                className={
                  ticket.status === "IN_PROGRESS" ? "active" : ""
                }
                disabled={
                  actionLoading || ticket.status === "IN_PROGRESS"
                }
                onClick={() => void onStatus("IN_PROGRESS")}
              >
                In progress
              </button>

              <button
                className={ticket.status === "RESOLVED" ? "active" : ""}
                disabled={
                  actionLoading ||
                  ticket.status === "RESOLVED" ||
                  ticket.status === "CLOSED"
                }
                onClick={() => void onStatus("RESOLVED")}
              >
                Resolve
              </button>
            </div>
          </div>
        )}

        <div className="activity">
          <div className="panel-heading">
            <h3>Activity</h3>
            <span>{activity.length} events</span>
          </div>

          <div className="timeline">
            {activity.map((item, index) => (
              <div className="timeline-item" key={`${item.title}-${index}`}>
                <div className="timeline-dot" />

                <div className="timeline-content">
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                  <time>{formatDate(item.date)}</time>
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="comment-box">
          <textarea
            value={comment}
            onChange={(event) => setComment(event.target.value)}
            placeholder="Write a comment..."
            rows={4}
          />

          <button
            className="primary-button"
            disabled={!comment.trim() || actionLoading}
            onClick={() => void onComment()}
          >
            {actionLoading ? "Saving..." : "Add comment"}
          </button>
        </div>
      </div>
    </div>
  );
}

export default App;