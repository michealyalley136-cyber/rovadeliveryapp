import Link from "next/link";
import styles from "./login.module.css";

export const metadata = { title: "Login | ROVA Ghana" };

export default function LoginPage() {
  return (
    <main className={styles.page}>
      <header className={styles.header}>
        <Link className={styles.logo} href="/" aria-label="ROVA Ghana home">ROVA<span>.</span></Link>
        <Link className={styles.home} href="/">← Back to home</Link>
      </header>
      <section className={styles.content} aria-labelledby="login-title">
        <p className={styles.eyebrow}>ROVA GHANA</p>
        <h1 id="login-title">Welcome back.</h1>
        <p className={styles.intro}>Your ROVA account, all in one place.</p>
        <p className={styles.notice} id="login-notice">ROVA is preparing for launch. Customer and operator account sign-in is not available yet. Please do not enter credentials.</p>
        <form className={styles.form} aria-describedby="login-notice">
          <fieldset disabled>
            <label htmlFor="login-identity">Phone number or email</label>
            <input id="login-identity" type="text" autoComplete="username" placeholder="Phone number or email" />
            <label htmlFor="login-password">Password</label>
            <input id="login-password" type="password" autoComplete="current-password" placeholder="Password" />
            <button type="button">Sign in</button>
          </fieldset>
        </form>
        <div className={styles.links}>
          <a href="#password-help">Forgot password?</a>
          <Link href="/apply">New to ROVA? Apply now</Link>
        </div>
        <div className={styles.help}>
          <p id="password-help"><strong>Password recovery</strong> will be available when account sign-in launches.</p>
          <p><strong>Account creation</strong> is not available yet. An application is not an account.</p>
        </div>
        <Link className={styles.status} href="/application-status">Check application status <span aria-hidden="true">→</span></Link>
        <div className={styles.staff}><Link href="/admin">Staff login</Link></div>
      </section>
    </main>
  );
}
