import { useEffect, useMemo, useState, useCallback } from "react";
import { useSearchParams, useNavigate } from "react-router-dom";
import {
  Plus, Search, CalendarDays, CheckCircle2, Clock, ListTodo, Trash2,
  CheckCircle, AlertCircle, Minus, Check, X, Sun, Moon, MessageSquare,
} from "lucide-react";
import toast from "react-hot-toast";
import { GlassCard, StatCard, Badge, Drawer } from "../../components/Primitives.jsx";
import { useEmployee } from "../../context/EmployeeContext.jsx";
import { EMP_SOP_CHECKLIST, getEmpAppToday, isTaskAssignedToEmployee, formatTaskDeadlineTime, findEmpTeamMember } from "../../data/employeeMock.js";
import { shouldPersistToApi } from "../../lib/api.js";
import { SEGMENT_WRAP, SEGMENT_BTN, SEGMENT_BTN_ACTIVE, SEGMENT_BTN_INACTIVE } from "../../lib/segmentPills.js";
import {
  EmpEmptyState, BtnPrimary, BtnSecondary, AvatarCircle,
  FormLabel, FormInput, FormSelect, FormGroup, FormRow, MOBILE_ACTION,
} from "../components/EmpUI.jsx";
import { TimeOfDaySelects } from "../components/TimeOfDaySelects.jsx";

const INPUT = "w-full h-10 px-3 rounded-xl bg-white border border-slate-200 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition";
const LABEL = "block text-[10px] font-bold uppercase tracking-wide text-slate-500 mb-1.5";

const PRIORITY = {
  high: { label: "High", tone: "danger", icon: AlertCircle },
  med: { label: "Medium", tone: "warning", icon: Minus },
  low: { label: "Low", tone: "success", icon: CheckCircle2 },
};

const TASK_TABS = [
  { id: "upcoming", label: "Upcoming", short: "Upcoming", icon: Clock },
  { id: "previous", label: "Previous", short: "Past", icon: CheckCircle },
  { id: "checklist", label: "Daily Checklist", short: "Checklist", icon: CheckCircle2 },
];

function Field({ label, children, className = "" }) {
  return (
    <div className={className}>
      <label className={LABEL}>{label}</label>
      {children}
    </div>
  );
}

function TaskCard({ task, onToggle, onDelete }) {
  const p = PRIORITY[task.priority] || PRIORITY.med;
  const PIcon = p.icon;
  const priorityPill = {
    high: "bg-red-50 text-red-700 border-red-200",
    med: "bg-amber-50 text-amber-800 border-amber-200",
    low: "bg-emerald-50 text-emerald-700 border-emerald-200",
  }[task.priority] || "bg-slate-50 text-slate-600 border-slate-200";

  return (
    <article className={`group rounded-xl sm:rounded-2xl border border-slate-200/80 bg-white p-2.5 sm:p-4 hover:border-slate-300 hover:shadow-[0_8px_24px_rgba(15,23,42,0.06)] transition-all min-w-0 ${task.done ? "opacity-70" : ""}`}>
      <div className="flex gap-2 sm:gap-3 items-start">
        <button
          type="button"
          onClick={onToggle}
          aria-label={task.done ? "Mark incomplete" : "Mark complete"}
          className={`mt-0.5 w-4 h-4 sm:w-5 sm:h-5 rounded-full border-2 flex items-center justify-center shrink-0 transition-all ${
            task.done
              ? "bg-emerald-500 border-emerald-500 text-white"
              : "border-slate-300 hover:border-slate-500 hover:bg-slate-50"
          }`}
        >
          {task.done && <Check className="w-2.5 h-2.5 sm:w-3 sm:h-3 stroke-[3]" />}
        </button>

        <div className="hidden sm:grid w-9 h-9 rounded-xl bg-slate-50 border border-slate-200 place-items-center shrink-0">
          {task.source === "followup" ? (
            <MessageSquare className="w-4 h-4 text-rose-600" />
          ) : (
            <ListTodo className="w-4 h-4 text-slate-600" />
          )}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-start gap-1 sm:gap-2">
            <p className={`text-xs sm:text-sm font-bold leading-snug flex-1 min-w-0 line-clamp-2 ${task.done ? "line-through text-slate-400" : "text-slate-900"}`}>
              {task.name || "Task"}
            </p>
            <button
              type="button"
              onClick={onDelete}
              className={`${MOBILE_ACTION} p-1 sm:p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 shrink-0`}
              aria-label="Delete task"
            >
              <Trash2 className="w-3 h-3 sm:w-3.5 sm:h-3.5" />
            </button>
          </div>

          <div className="flex items-center gap-1 sm:gap-2 mt-1 sm:mt-2 min-w-0 flex-wrap">
            {task.source === "followup" && (
              <>
                <span className="sm:hidden text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border bg-rose-50 text-rose-700 border-rose-100 shrink-0">
                  Follow-up
                </span>
                <span className="hidden sm:inline-flex">
                  <Badge tone="primary">Follow-up</Badge>
                </span>
              </>
            )}
            <span className={`sm:hidden text-[7px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded border shrink-0 ${priorityPill}`}>
              {p.label}
            </span>
            <span className="hidden sm:inline-flex">
              <Badge tone={p.tone}>
                <PIcon className="w-3 h-3" />
                {p.label}
              </Badge>
            </span>
            {task.assignee && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold text-slate-500 min-w-0 truncate ml-auto sm:ml-0">
                <AvatarCircle
                  initials={task.assigneeAv || "?"}
                  color={task.assigneeColor || "#475569"}
                  size={18}
                />
                <span className="hidden sm:inline truncate">{task.assignee}</span>
              </span>
            )}
            {task.deadline && (
              <span className="inline-flex items-center gap-1 text-[9px] sm:text-[10px] font-semibold text-slate-400 shrink-0">
                <Clock className="w-3 h-3" />
                {formatTaskDeadlineTime(task.deadline)}
              </span>
            )}
          </div>
        </div>
      </div>
    </article>
  );
}

function ChecklistItem({ label, checked, onToggle }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`w-full text-left p-2.5 sm:p-3.5 rounded-lg sm:rounded-xl border transition flex items-start gap-2 sm:gap-3 hover:border-slate-300 ${
        checked ? "bg-slate-50 border-slate-200" : "bg-white border-slate-100"
      }`}
    >
      <div
        className={`w-4 h-4 sm:w-5 sm:h-5 rounded-md border-2 grid place-items-center shrink-0 transition-colors ${
          checked ? "bg-slate-800 border-slate-800 text-white" : "border-slate-300 bg-white"
        }`}
      >
        {checked && <Check className="w-2.5 h-2.5 sm:w-3.5 sm:h-3.5 stroke-[3]" />}
      </div>
      <span className={`text-[11px] sm:text-xs font-semibold leading-snug ${checked ? "text-slate-500 line-through" : "text-slate-700"}`}>
        {label}
      </span>
    </button>
  );
}

function AddTaskDrawer({ open, newTask, setNewTask, dateFilter, setDateFilter, onClose, onSubmit, currentEmployee, teamMembers = [], submitting }) {
  return (
    <Drawer open={open} onClose={onClose} title="New Task" width="drawer-panel">
      <p className="text-xs text-slate-500 mb-4 pb-3 border-b border-slate-100">
        Add a task to your daily workflow
      </p>

      <div className="space-y-4">
        <Field label="What needs to be done?">
          <input
            className={INPUT}
            value={newTask.name}
            onChange={(e) => setNewTask((p) => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Call Rajesh before 11 AM"
            autoFocus
            onKeyDown={(e) => e.key === "Enter" && onSubmit()}
          />
        </Field>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="Due Date">
            <input
              type="date"
              className={INPUT}
              value={dateFilter}
              onChange={(e) => setDateFilter(e.target.value)}
            />
          </Field>
          <Field label="Deadline">
            <TimeOfDaySelects
              value={newTask.deadline}
              onChange={(deadline) => setNewTask((p) => ({ ...p, deadline }))}
              selectClassName="h-11 sm:h-10 rounded-xl bg-white border-slate-200 text-sm text-slate-900 w-full"
              SelectComponent={({ className, children, ...props }) => (
                <select className={className} {...props}>{children}</select>
              )}
            />
          </Field>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
          <Field label="Priority">
            <select
              className={INPUT}
              value={newTask.priority}
              onChange={(e) => setNewTask((p) => ({ ...p, priority: e.target.value }))}
            >
              <option value="high">High</option>
              <option value="med">Medium</option>
              <option value="low">Low</option>
            </select>
          </Field>
          <Field label="Assign To">
            <select
              className={INPUT}
              value={newTask.assignee}
              onChange={(e) => setNewTask((p) => ({ ...p, assignee: e.target.value }))}
            >
              {teamMembers.length === 0 && <option value="">No teammates loaded</option>}
              {teamMembers.map((member) => (
                <option key={member.id ?? member.name} value={member.name}>
                  {member.name}
                  {member.name === currentEmployee?.name ? " (You)" : ""}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </div>

      <div className="sticky bottom-0 -mx-4 sm:-mx-5 -mb-4 sm:-mb-5 px-4 sm:px-5 py-3 sm:py-4 mt-6 bg-white/95 backdrop-blur-md border-t border-slate-100 flex items-center justify-between gap-2 z-20">
        <BtnPrimary onClick={onSubmit} disabled={submitting} className="flex-1 justify-center py-2.5 sm:py-2 text-sm font-bold shadow-sm">
          <CheckCircle2 className="w-4 h-4" /> {submitting ? "Saving…" : "Create Task"}
        </BtnPrimary>
        <BtnSecondary onClick={onClose} className="px-4 py-2.5 sm:py-2 text-sm">
          <X className="w-4 h-4" /> Cancel
        </BtnSecondary>
      </div>
    </Drawer>
  );
}


export default function EmployeeTasks() {
  const { tasks, createTask, updateTaskStatus, removeTask, syncTaskWithFollowUp, employee, usingApi, loading, refreshTasks, teamEmployees, refreshTeamEmployees } = useEmployee();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const [tab, setTab] = useState("upcoming");
  const [dateFilter, setDateFilter] = useState(getEmpAppToday());
  const [search, setSearch] = useState("");
  const [drawerOpen, setDrawerOpen] = useState(searchParams.get("action") === "add");
  const [submitting, setSubmitting] = useState(false);

  // Load the real team roster for the "Assign To" picker.
  useEffect(() => {
    if (drawerOpen && !teamEmployees?.length && refreshTeamEmployees) {
      refreshTeamEmployees();
    }
  }, [drawerOpen, teamEmployees?.length, refreshTeamEmployees]);
  const [newTask, setNewTask] = useState({
    name: "",
    priority: "med",
    assignee: employee?.name || "",
    deadline: "17:00",
  });
  const [checklistChecks, setChecklistChecks] = useState(() => {
    if (typeof window === "undefined") return {};
    try {
      const saved = window.localStorage.getItem("emp_daily_checklist_checks");
      if (!saved) return {};
      const parsed = JSON.parse(saved);
      return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : {};
    } catch {
      return {};
    }
  });

  useEffect(() => {
    localStorage.setItem("emp_daily_checklist_checks", JSON.stringify(checklistChecks));
  }, [checklistChecks]);

  const toggleChecklist = (key) => {
    setChecklistChecks((prev) => ({ ...prev, [key]: !prev[key] }));
    toast.success("Checklist updated");
  };

  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (loading || !employee?.id || loaded) return;
    const hasTasks = Object.values(tasks || {}).some(
      (items) => Array.isArray(items) && items.length > 0,
    );
    if (hasTasks) {
      setLoaded(true);
      return;
    }
    refreshTasks(employee.id, employee).finally(() => {
      setLoaded(true);
    });
  }, [loading, employee?.id, tasks, refreshTasks, loaded]);

  const today = new Date(`${getEmpAppToday()}T00:00:00`);

  useEffect(() => {
    if (searchParams.get("action") === "add") setDrawerOpen(true);
  }, [searchParams]);

  useEffect(() => {
    if (!employee?.name) return;
    setNewTask((prev) => (
      prev.assignee ? prev : { ...prev, assignee: employee.name }
    ));
  }, [employee?.name]);

  const resetNewTask = useCallback(() => ({
    name: "",
    priority: "med",
    assignee: employee?.name || "",
    deadline: "17:00",
  }), [employee?.name]);

  const allTasks = useMemo(() =>
    Object.entries(tasks || {}).flatMap(([date, items]) =>
      (Array.isArray(items) ? items : [])
        .filter((t) => isTaskAssignedToEmployee(t, employee?.name))
        .map((t) => ({ ...t, date }))
    ),
  [tasks, employee?.name]);

  const stats = useMemo(() => {
    const pending = allTasks.filter((t) => !t.done).length;
    const doneToday = allTasks.filter((t) => t.done && t.date === getEmpAppToday()).length;
    const highPriority = allTasks.filter((t) => !t.done && t.priority === "high").length;
    const upcomingDays = new Set(allTasks.filter((t) => !t.done && new Date(`${t.date}T00:00:00`) >= today).map((t) => t.date)).size;
    return { pending, doneToday, highPriority, upcomingDays };
  }, [allTasks, today]);

  const grouped = useMemo(() => {
    let entries = Object.entries(tasks || {})
      .map(([date, items]) => [
        date,
        (Array.isArray(items) ? items : []).filter((t) => isTaskAssignedToEmployee(t, employee?.name)),
      ])
      .filter(([, items]) => items.length > 0)
      .sort(([a], [b]) => new Date(a) - new Date(b));
    entries = tab === "upcoming"
      ? entries.filter(([d]) => new Date(`${d}T00:00:00`) >= today)
      : entries.filter(([d]) => new Date(`${d}T00:00:00`) < today);

    if (search.trim()) {
      const q = search.toLowerCase();
      entries = entries
        .map(([date, items]) => [date, items.filter((t) => (t.name || "").toLowerCase().includes(q))])
        .filter(([, items]) => items.length > 0);
    }
    return entries;
  }, [tasks, tab, today, search, employee?.name]);

  const closeDrawer = () => {
    setDrawerOpen(false);
    setNewTask(resetNewTask());
    if (searchParams.get("action") === "add") {
      navigate("/employee/tasks", { replace: true });
    }
  };

  const toggleTask = async (date, id) => {
    const task = tasks[date]?.find((t) => t.id === id);
    const nextDone = !task?.done;
    if (task?.followUpId) {
      syncTaskWithFollowUp(date, id, nextDone);
    } else {
      await updateTaskStatus(date, id, nextDone);
    }
    toast.success("Task updated");
  };

  const deleteTask = async (date, id) => {
    await removeTask(date, id);
    toast.success("Task removed");
  };

  const addTask = async () => {
    if (submitting) return;
    if (!newTask.name.trim()) {
      toast.error("Enter a task name");
      return;
    }
    if (!newTask.deadline) {
      toast.error("Set a deadline time");
      return;
    }
    if (typeof createTask !== "function") {
      toast.error("Task saving is not available right now");
      return;
    }

    // Resolve the picked assignee from the real team roster (never silently
    // reassign to the current user just because no avatar record was found).
    const member = (teamEmployees || []).find((m) => m.name === newTask.assignee)
      || (teamEmployees || []).find((m) => m.name === employee?.name);
    const assigneeName = newTask.assignee || member?.name || employee?.name || "You";
    setSubmitting(true);
    try {
      const saved = await createTask({
        date: dateFilter,
        task: {
          name: newTask.name.trim(),
          done: false,
          priority: newTask.priority,
          assignee: assigneeName,
          assigneeAv: member?.av || employee?.initials || "?",
          assigneeColor: member?.color || employee?.avatarColor || "#475569",
          deadline: newTask.deadline,
          createdBy: employee?.name || assigneeName,
        },
      });
      if (saved === null && shouldPersistToApi(usingApi)) return;
      closeDrawer();
      setNewTask(resetNewTask());
      toast.success(
        assigneeName === employee?.name
          ? "Task added to your list"
          : `Task assigned to ${assigneeName}`,
      );
    } catch {
      // createTask already toasts on failure
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-3 sm:space-y-5 page-shell min-w-0 animate-fade-in">
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-2 sm:gap-3 md:gap-4">
        <StatCard compact label="Pending" value={String(stats.pending)} icon={ListTodo} tone="primary" change={`${stats.highPriority} high priority`} sub="" />
        <StatCard compact label="Done Today" value={String(stats.doneToday)} icon={CheckCircle2} tone="success" change="on track" sub="" />
        <StatCard compact label="High Priority" value={String(stats.highPriority)} icon={AlertCircle} tone="warning" change="needs attention" sub="" />
        <StatCard compact label="Active Days" value={String(stats.upcomingDays)} icon={CalendarDays} tone="info" change="upcoming" sub="" />
      </div>

      <GlassCard className="p-2.5 sm:p-4">
        {/* Mobile & tablet — unchanged stacked layout */}
        <div className="flex flex-col gap-2 sm:gap-3 lg:hidden">
          <div className="grid grid-cols-3 gap-0.5 p-0.5 rounded-lg bg-slate-100/80 border border-slate-200/80 sm:hidden">
            {TASK_TABS.map(({ id, short, icon: Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setTab(id)}
                className={`flex flex-col items-center justify-center gap-0.5 py-1.5 rounded-md text-[9px] font-bold transition ${SEGMENT_BTN} ${
                  tab === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                }`}
              >
                <Icon className="w-3 h-3" />
                {short}
              </button>
            ))}
          </div>

          <div className="hidden sm:block">
            <div className={SEGMENT_WRAP}>
              {TASK_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1 ${SEGMENT_BTN} ${
                    tab === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          {tab !== "checklist" && (
            <div className="flex flex-col gap-2 w-full">
              <div className="flex gap-2">
                <div className="relative flex-1 min-w-0">
                  <Search className="absolute left-2.5 sm:left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 sm:w-4 sm:h-4 text-slate-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="w-full h-9 sm:h-10 pl-8 sm:pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
                  />
                </div>
                <BtnPrimary onClick={() => setDrawerOpen(true)} className="inline-flex shrink-0 text-xs sm:text-sm px-2.5 sm:px-3.5 py-2 rounded-xl whitespace-nowrap">
                  <Plus className="w-4 h-4" /> <span className="hidden xs:inline">Add Task</span><span className="xs:hidden">Add</span>
                </BtnPrimary>
              </div>
            </div>
          )}

          <p className="text-[9px] sm:text-[11px] font-semibold text-slate-400">
            {tab === "checklist"
              ? "Morning & evening checklists"
              : `${stats.pending} open · ${stats.doneToday} done today`}
            <span className="hidden sm:inline">
              {tab !== "checklist" && ` · ${tab === "upcoming" ? "Showing upcoming" : "Showing past tasks"}`}
            </span>
          </p>
        </div>

        {/* Web — single toolbar row */}
        <div className="hidden lg:block space-y-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className={`${SEGMENT_WRAP} shrink-0`}>
              {TASK_TABS.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setTab(id)}
                  className={`flex items-center gap-1 ${SEGMENT_BTN} ${
                    tab === id ? SEGMENT_BTN_ACTIVE : SEGMENT_BTN_INACTIVE
                  }`}
                >
                  <Icon className="w-3.5 h-3.5" />
                  {label}
                </button>
              ))}
            </div>

            {tab !== "checklist" && (
              <>
                <div className="relative flex-1 min-w-0 max-w-md">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Search tasks…"
                    className="w-full h-10 pl-9 pr-3 rounded-xl bg-white border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200 focus:border-slate-300 transition"
                  />
                </div>
                <BtnPrimary onClick={() => setDrawerOpen(true)} className="shrink-0 !rounded-xl whitespace-nowrap">
                  <Plus className="w-4 h-4" /> Add Task
                </BtnPrimary>
              </>
            )}
          </div>

          <p className="text-[11px] font-semibold text-slate-400">
            {tab === "checklist"
              ? "Morning & evening checklists"
              : `${stats.pending} open · ${stats.doneToday} done today · ${tab === "upcoming" ? "Showing upcoming" : "Showing past tasks"}`}
          </p>
        </div>
      </GlassCard>

      {tab === "checklist" ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4 items-start">
          <GlassCard className="p-2.5 sm:p-5 space-y-2 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 sm:pb-3">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-amber-50 border border-amber-100 grid place-items-center shrink-0">
                  <Sun className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-amber-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-black text-slate-900">Morning Tasks</h3>
                  <p className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">Complete before 11:00 AM</p>
                </div>
              </div>
              <span className="hidden sm:inline-flex"><Badge tone="muted">Task Sheet</Badge></span>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {EMP_SOP_CHECKLIST.morning.map((task, idx) => {
                const key = `morning-${idx}`;
                return (
                  <ChecklistItem
                    key={key}
                    label={task}
                    checked={!!checklistChecks[key]}
                    onToggle={() => toggleChecklist(key)}
                  />
                );
              })}
            </div>
          </GlassCard>

          <GlassCard className="p-2.5 sm:p-5 space-y-2 sm:space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-2 sm:pb-3">
              <div className="flex items-center gap-2 sm:gap-2.5 min-w-0">
                <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-lg sm:rounded-xl bg-indigo-50 border border-indigo-100 grid place-items-center shrink-0">
                  <Moon className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-indigo-600" />
                </div>
                <div className="min-w-0">
                  <h3 className="text-xs sm:text-sm font-black text-slate-900">Evening Wrap-up</h3>
                  <p className="text-[9px] sm:text-[10px] text-slate-400 hidden sm:block">Complete before 6:00 PM</p>
                </div>
              </div>
              <span className="hidden sm:inline-flex"><Badge tone="success">Submission</Badge></span>
            </div>
            <div className="space-y-1.5 sm:space-y-2">
              {EMP_SOP_CHECKLIST.evening.map((task, idx) => {
                const key = `evening-${idx}`;
                return (
                  <ChecklistItem
                    key={key}
                    label={task}
                    checked={!!checklistChecks[key]}
                    onToggle={() => toggleChecklist(key)}
                  />
                );
              })}
            </div>
          </GlassCard>
        </div>
      ) : grouped.length === 0 ? (
        <GlassCard className="py-4">
          <EmpEmptyState
            icon=""
            title={search ? "No tasks match your search" : `No ${tab} tasks`}
            subtitle={search ? "Try a different keyword" : "Create your first task to stay on track"}
          />
          {!search && (
            <div className="flex justify-center pb-6">
              <BtnPrimary onClick={() => setDrawerOpen(true)}><Plus className="w-4 h-4" /> Add Task</BtnPrimary>
            </div>
          )}
        </GlassCard>
      ) : (
        <div className="space-y-3 sm:space-y-6">
          {grouped.map(([date, items]) => {
            const d = new Date(`${date}T00:00:00`);
            const done = items.filter((t) => t.done).length;
            const pct = items.length ? Math.round((done / items.length) * 100) : 0;
            const isToday = date === getEmpAppToday();

            return (
              <section key={date}>
                <div className="flex items-center justify-between gap-2 mb-2 sm:mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className={`w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl grid place-items-center shrink-0 ${
                      isToday ? "bg-slate-800 text-white shadow-sm" : "bg-slate-50 border border-slate-200 text-slate-600"
                    }`}>
                      <CalendarDays className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap">
                        <h3 className="text-xs sm:text-base font-display font-bold text-slate-900 truncate">
                          <span className="sm:hidden">
                            {d.toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                          </span>
                          <span className="hidden sm:inline">
                            {d.toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long" })}
                          </span>
                        </h3>
                        {isToday && (
                          <span className="text-[8px] sm:text-[10px] font-bold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-100">
                            Today
                          </span>
                        )}
                      </div>
                      <p className="text-[9px] sm:text-[11px] text-slate-500 font-medium mt-0.5">
                        {items.length} tasks · {done} done
                        <span className="sm:hidden"> · {pct}%</span>
                      </p>
                    </div>
                  </div>
                  <div className="hidden sm:flex items-center gap-2 shrink-0">
                    <div className="w-24 h-1.5 rounded-full bg-slate-100 overflow-hidden">
                      <div className="h-full rounded-full bg-slate-700 transition-all duration-500" style={{ width: `${pct}%` }} />
                    </div>
                    <span className="text-[11px] font-black text-slate-600 tabular-nums w-8">{pct}%</span>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 sm:grid sm:grid-cols-1 xl:grid-cols-2 sm:gap-3">
                  {items.map((t) => (
                    <TaskCard
                      key={t.id}
                      task={t}
                      onToggle={() => toggleTask(date, t.id)}
                      onDelete={() => deleteTask(date, t.id)}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* Mobile Floating Action Button */}
      <button
        type="button"
        onClick={() => setDrawerOpen(true)}
        aria-label="Create Task"
        className="sm:hidden fixed right-4 bottom-20 z-40 w-12 h-12 rounded-full bg-slate-900 text-white shadow-xl flex items-center justify-center active:scale-95 transition-transform"
      >
        <Plus className="w-6 h-6" />
      </button>

      <AddTaskDrawer
        open={drawerOpen}
        newTask={newTask}
        setNewTask={setNewTask}
        dateFilter={dateFilter}
        setDateFilter={setDateFilter}
        onClose={closeDrawer}
        onSubmit={addTask}
        currentEmployee={employee}
        teamMembers={teamEmployees || []}
        submitting={submitting}
      />
    </div>
  );
}
