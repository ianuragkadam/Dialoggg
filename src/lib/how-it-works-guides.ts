export const ADD_PROJECT_GUIDE = [
  "Fill in the project and client details. Fields marked * are required.",
  "Project Type is your label for the kind of job, such as Acrylic or Modular. Pick a Calendar Color too. It's the color this project's tasks show on the Master Calendar, and you can change individual tasks later.",
  "Project Plan starting point: start blank, or start from a template. A template gives you a ready-made task list (tasks, durations, and links) that you can edit as needed.",
  "Internal Users: check the people on your team who work on this job.",
  "External Users: clients and other outside people. Invite them by email. They can view only this project, and they can't make changes. Invitations show under Pending Invitations until accepted.",
  "Click Review Project to check everything before it's saved.",
] as const;

export const PROJECT_DIRECTORY_GUIDE = [
  "Click + Add Project to start a new job. Only Owners and Admins can add projects.",
  "The boxes at the top count your Active and Archived projects, and the menu next to the search box switches between them. Search by name, client, or type, or use the Project Type checkboxes to narrow the list.",
  "Click Open to go into a project. Use Edit Project inside it to change its details.",
  "When a job is finished, open it, click Edit Project, then Complete Job. It moves to Archived and comes off your calendars. To bring one back, open it from the Archived list and restore it to Active.",
  "This page shows every job in your company. To see only the jobs you're assigned to, use My Projects.",
] as const;

export const RESOURCE_DIRECTORY_GUIDE = [
  "A Resource is anything you schedule on a job: an employee, subcontractor, supplier, or piece of equipment. A User is someone who logs in to Dialoggg. Resources do not log in.",
  "One person can be both. An employee who logs in as a User can also be assigned to Tasks as a Resource. Add them as a Resource when you invite them under Users, or later by opening the Resource and clicking Link User.",
  "Linking connects the two records. It does not give anyone login access or change what they can do. Each User can be linked to one Resource.",
  "Click + Add Resource and choose a category: Team, Subcontractor, Supplier, Equipment, or Other. Categories let you filter the Resource Calendar.",
  "Assign Resources to Tasks in the Resources column of the Project Plan. Their work then appears on the Resource Calendar.",
  "Deactivate a Resource that is no longer available. They cannot be assigned to new Tasks or Events, but past assignments and calendar history stay. Deactivating a Resource does not affect a linked User's login.",
  "Schedule conflicts counts Resources booked for two things at the same time.",
] as const;

export const USERS_GUIDE = [
  "A user is someone who logs in to Dialoggg. Owners and Admins click Invite User to add one. They'll get an email to set up their login.",
  "There are four roles. Owner and Admin can create and edit projects and schedules. Employee can view everything but can't change anything. External/Client can view only the projects they've been given access to.",
  "Owners can invite any role, including more Owners. Admins can invite Admins, Employees, and clients, but not Owners.",
  "Your team is listed at the top of this page, and clients and other outside people are in External Users / Clients below it.",
  "Employees see every project and schedule. The projects you check under Project assignments are the ones that appear on that person's My Projects page, and they're the ones the person gets notifications for.",
  "A user isn't automatically a resource. Check Also add as a Resource when inviting someone you'll schedule on tasks, or link them later under Resources.",
  "Deactivate a user who should no longer log in. Their access ends immediately and they're signed out. Their past project assignments stay visible, and a linked resource isn't affected.",
] as const;

export const PROJECT_PLAN_HOW_IT_WORKS = [
  "Click + Add Task to add a task. Click the + at the end of a row to add a subtask under it.",
  "A task with subtasks is a header. Click its small arrow to collapse or expand it. Its bar automatically covers the dates of everything under it.",
  "Drag a bar to move it to new dates. Drag the end of a bar to make the task longer or shorter.",
  "To link tasks, hover over a bar until a circle appears at each end. Drag a circle onto the task you want to link to, then choose how they connect. If the first task moves, every task linked after it moves too.",
  "Use the Resources column to assign people or equipment, and the Done column to track progress. Any change here updates the Project Calendar and Master Calendar automatically.",
] as const;
