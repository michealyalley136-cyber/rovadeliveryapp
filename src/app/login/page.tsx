import Link from "next/link";
import { CustomerLoginForm } from "@/components/customer-login-form";
import styles from "./login.module.css";

export const metadata = { title: "Customer Login | ROVA Ghana" };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/" aria-label="ROVA Ghana home">ROVA<span>.</span></Link>
        <Link className={styles.home} href="/">← Back to home</Link>
      </header>
      <section className={styles.content} aria-labelledby="login-title">
        <p className={styles.eyebrow}>VERIFIED CUSTOMER ACCESS</p>
        <h1 id="login-title">Welcome back.</h1>
        <p className={styles.intro}>Sign in to your activated ROVA customer account.</p>
        <p className={styles.notice} id="login-notice">
          An application or status reference is not an account credential. Only applicants who completed secure identity activation can sign in.
        </p>
        <CustomerLoginForm />
        <div className={styles.links}>
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/apply">New to ROVA? Apply now</Link>
        </div>
        <div className={styles.help}>
          <p><strong>Account creation</strong> is controlled. Submitting an application does not activate an account.</p>
          <p><strong>Booking availability</strong> remains disabled pending separate approval. Signing in does not enable transportation services.</p>
        </div>
        <Link className={styles.status} href="/application-status">Already applied? Check application status <span aria-hidden="true">→</span></Link>
        <div className={styles.staff}><Link href="/admin">Staff login</Link></div>
      </section>
    </main>
  );
}
