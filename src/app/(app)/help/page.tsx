export default function HelpPage() {
  return (
    <div className="max-w-3xl space-y-4">
      <h1 className="text-2xl font-bold">Help — Dialoggg in a Nutshell</h1>

      <Section title="What is Dialoggg?">
        Dialoggg is an Online Virtual Office for small-to-medium contractors in service-related industries.
        Project planning, resource coordination, and event and task scheduling — all in one place.
      </Section>

      <Section title="The Project Plan (Gantt chart)">
        <p>The Project Plan is divided into two parts:</p>
        <ul className="list-disc ml-5 space-y-1 text-sm">
          <li><strong>Left:</strong> task list — name, start date, duration</li>
          <li><strong>Right:</strong> Gantt chart — each task is a bar showing when it starts and ends</li>
        </ul>
        <p className="mt-2">Hover a bar and you'll see <strong>link circles</strong> at each end — drag one to another task to create a link.</p>
        <p>If a predecessor slips, all linked successors automatically push back.</p>
        <p className="text-sm text-gray-600 mt-2"><strong>Note:</strong> Linking is NOT the same as making a subtask. Linking just means "Task B can't start until Task A is done."</p>
      </Section>

      <Section title="Project Calendar">
        Same tasks as the Project Plan, but in traditional month/week view. Also shows <strong>Events</strong> (meetings, site visits, holidays) that don't appear on the Gantt.
      </Section>

      <Section title="Resource Calendar">
        Shows every Resource as a row across time, making cross-Project scheduling and conflicts easier to understand.
      </Section>

      <Section title="Master Calendar">
        Every task and event across every project, in one place.
      </Section>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border rounded shadow-sm p-6">
      <h2 className="font-semibold text-blue-800 mb-2">{title}</h2>
      <div className="text-sm text-gray-700 space-y-2">{children}</div>
    </div>
  );
}
