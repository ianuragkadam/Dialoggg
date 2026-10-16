import Link from "next/link";
import Image from "next/image";
import LandingAccessForm from "@/components/LandingAccessForm";
import dialogggLogo from "../../dialoggg-lockup-transparent-onDark.png";
import styles from "./landing.module.css";

const benefits = [
  "Drag-and-drop timelines for every job",
  "One master calendar for all your jobs",
  "Reusable job templates",
  "Job-type tags and filters",
  "Works on any phone, no app to download",
  "Syncs to Google Calendar",
  "Job documents stay in your own OneDrive",
  "Four simple user roles, from owner to client",
];

const exclusions = [
  "Accounting and invoicing",
  "Bidding and estimating",
  "Chat feeds and photo galleries",
  "A 200-page user manual",
  "Months of setup and training",
  "Settings you’ll never touch",
];

function Brand({ small = false }: { small?: boolean }) {
  return <Image src={dialogggLogo} alt="Dialoggg" className={small ? styles.footerLogo : styles.logo} priority={!small} />;
}

function ProblemIcon({ kind }: { kind: "board" | "sheet" | "phone" }) {
  return <svg aria-hidden="true" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
    {kind === "board" && <><rect x="3" y="4" width="18" height="12" rx="1.5" /><path d="M8 20l4-4 4 4M7 8h6M7 11h9" /></>}
    {kind === "sheet" && <><rect x="3" y="3" width="18" height="18" rx="1.5" /><path d="M3 9h18M3 15h18M9 3v18M15 3v18" /></>}
    {kind === "phone" && <><rect x="6" y="2" width="12" height="20" rx="2" /><path d="M9 7h6M9 10h4M9 13h6M11 18h2" /></>}
  </svg>;
}

export default async function HomePage() {
  return <main className={styles.page}>
    <header className={styles.header}>
      <div className={styles.headerInner}>
        <Link href="/" aria-label="Dialoggg home"><Brand /></Link>
        <nav className={styles.headerNav} aria-label="Main navigation">
          <a href="#early-access" className={styles.headerRequest}>Request access</a>
          <Link href="/login" className={styles.loginButton}>Log in</Link>
        </nav>
      </div>
    </header>

    <section id="top" className={styles.hero}>
      <div className={styles.heroInner}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}><span className={styles.brandMark} aria-hidden="true"><i /><i /><i /></span>Scheduling for contractors</p>
          <h1>Every job.<br />Every crew.<br /><span>One calendar.</span></h1>
          <p className={styles.heroDescription}>Dialoggg is scheduling software built by a contractor, for contractors. Plan each job on a simple timeline, and your whole operation lands on one calendar, automatically.</p>
          <div className={styles.heroActions}>
            <a href="#early-access" className={styles.primaryButton}>Request early access</a>
            <a href="#how" className={styles.textLink}>See how it works ↓</a>
          </div>
        </div>
        <div className={styles.heroVisual}>
          <div className={styles.desktopFrame}>
            <div className={styles.windowDots}><i /><i /><i /></div>
            <div className={styles.videoViewport}>
              <video className={styles.mediaVideo} autoPlay loop muted playsInline preload="metadata" poster="/landing/project-plan.jpg" aria-label="A project plan demonstration showing tasks, crews and dependencies on a timeline">
                <source src="/landing/hero-project-plan-onedrive.mp4" type="video/mp4" />
                Your browser does not support video playback.
              </video>
            </div>
          </div>
          <div className={styles.heroPhone}><Image src="/landing/dialoggg-phone.jpg" alt="Dialoggg master calendar on a phone" width={360} height={760} className={styles.phoneImage} /></div>
        </div>
      </div>
    </section>

    <section className={styles.problem}>
      <div className={styles.sectionInner}>
        <h2>Sound familiar?</h2>
        <div className={styles.problemCards}>
          <article><ProblemIcon kind="board" /><p>The whiteboard in the shop that&apos;s already out of date.</p></article>
          <article><ProblemIcon kind="sheet" /><p>The spreadsheet only one person knows how to update.</p></article>
          <article><ProblemIcon kind="phone" /><p>Twenty texts just to move one crew back a day.</p></article>
        </div>
        <div className={styles.problemOutro}><p>Then one job slips, and everything behind it slips too.</p><strong>There&apos;s a better way. And it isn&apos;t complicated.</strong></div>
      </div>
    </section>

    <section id="how" className={styles.how}>
      <div className={styles.sectionInner}>
        <div className={styles.sectionTitle}><span>How it works</span><h2>Three steps. That&apos;s the whole system.</h2></div>
        <div className={styles.steps}>
          <article className={styles.step}>
            <div className={styles.stepCopy}><span className={styles.stepNumber}>1</span><h3>Plan the job.</h3><p>Drag tasks onto a simple timeline. Move one task, and everything that depends on it moves too. Start from a saved template, and a job you&apos;ve built before takes minutes.</p></div>
            <div className={styles.mediaFrame}>
              <div className={styles.videoViewport}>
                <video className={styles.mediaVideo} autoPlay loop muted playsInline preload="metadata" poster="/landing/project-plan.jpg" aria-label="A task is dragged on a job timeline and dependent tasks shift automatically">
                  <source src="/landing/timeline-demo-onedrive.mp4" type="video/mp4" />
                  Your browser does not support video playback.
                </video>
              </div>
            </div>
          </article>
          <article className={styles.step}>
            <div className={styles.stepCopy}><span className={styles.stepNumber}>2</span><h3>See everything at once.</h3><p>Every job flows onto one master calendar. Change the plan, and the calendar changes with it. Filter by job type to see just what you need.</p></div>
            <div className={styles.mediaFrame}>
              <div className={styles.videoViewport}>
                <video className={styles.mediaVideo} autoPlay loop muted playsInline preload="none" poster="/landing/master-calendar.jpg" aria-label="Master Calendar demonstration showing color-coded tasks from several jobs">
                  <source src="/landing/master-calendar-demo-onedrive.mp4" type="video/mp4" />
                  Your browser does not support video playback.
                </video>
              </div>
            </div>
          </article>
          <article className={styles.step}>
            <div className={styles.stepCopy}><span className={styles.stepNumber}>3</span><h3>Keep everyone in the loop.</h3><p>Your crews see their work on their phones and in their Google Calendar. No app to download. Clients see their own job, and nothing else.</p></div>
            <div className={styles.phonePair}>
              <figure><div className={styles.pairPhone}><Image src="/landing/dialoggg-phone.jpg" alt="Dialoggg master calendar on a phone" width={360} height={760} className={styles.phoneImage} /></div><figcaption>In Dialoggg</figcaption></figure>
              <figure><div className={styles.pairPhone}><Image src="/landing/google-calendar-phone.jpg" alt="The same tasks synced into Google Calendar on a phone" width={360} height={760} className={styles.phoneImage} /></div><figcaption>In Google Calendar</figcaption></figure>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section className={styles.benefits}>
      <div className={styles.sectionInner}>
        <div className={styles.benefitsIntro}><h2>Does one thing. <span>Does it right.</span></h2><p>Most construction software tries to run your whole business. Dialoggg runs your schedule, and gets out of your way.</p></div>
        <div className={styles.benefitCards}>
          <article className={styles.getCard}><h3>What you get</h3><ul>{benefits.map(item => <li key={item}><span aria-hidden="true">✓</span>{item}</li>)}</ul></article>
          <article className={styles.notCard}><h3>What you won&apos;t find</h3><ul>{exclusions.map(item => <li key={item}><span aria-hidden="true">×</span><s>{item}</s></li>)}</ul></article>
        </div>
        <p className={styles.benefitsClose}>If you can read a calendar, you can run Dialoggg.</p>
      </div>
    </section>

    <section className={styles.founder}>
      <div className={styles.founderInner}>
        <div className={styles.founderMedia}>
          <div className={styles.videoViewport}>
            <video className={styles.founderVideo} controls playsInline preload="none" poster="/landing/founder-video-poster.jpg" aria-label="Scott Grote, founder, explains why he built Dialoggg, filmed on a job site">
              <source src="/landing/founder-original-onedrive.mp4" type="video/mp4" />
              Your browser does not support video playback.
            </video>
          </div>
        </div>
        <div className={styles.founderCopy}>
          <span className={styles.eyebrow}>Built by a contractor</span>
          <h2>Built on the job site, not in a boardroom.</h2>
          <blockquote>“I&apos;ve spent my career building: homes, sports courts, gyms, remodels. Every scheduling tool I tried was either too complicated for my crews or didn&apos;t do the one thing I needed, which was show me every job on one calendar. So I built Dialoggg. Today it runs the schedule at Sport Court of Pennsylvania, and I think it can run yours.”</blockquote>
          <div className={styles.founderName}><strong>Scott Grote</strong><span>Founder, Dialoggg · Co-owner, Sport Court of Pennsylvania</span></div>
        </div>
      </div>
    </section>

    <section id="early-access" className={styles.cta}>
      <div className={styles.ctaInner}>
        <div className={styles.ctaCopy}><h2>See your whole schedule <span>in one place.</span></h2><p>We&apos;re bringing on a small group of contractors first. Tell us a little about your company, and we&apos;ll reach out personally to get you set up.</p><p>We reply within one business day.</p></div>
        <LandingAccessForm />
      </div>
    </section>

    <footer className={styles.footer}><div className={styles.footerInner}><Link href="/" aria-label="Dialoggg home"><Brand small /></Link><nav aria-label="Footer navigation"><Link href="/login">Log in</Link><a href="mailto:info@dialoggg.com">Contact</a><span>© {new Date().getFullYear()} Dialoggg</span></nav></div></footer>
  </main>;
}
