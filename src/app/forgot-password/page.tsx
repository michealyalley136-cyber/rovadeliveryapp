import Link from "next/link";
import { CustomerSecurityForm } from "@/components/customer-security-form";
import styles from "@/app/login/login.module.css";

export default function ForgotPasswordPage() {
  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.logo} href="/">ROVA<span>.</span></Link><Link className={styles.home} href="/login">← Sign in</Link></header>
    <section className={styles.content}>
      <p className={styles.eyebrow}>CUSTOMER ACCOUNT RECOVERY</p>
      <h1>Reset your password.</h1>
      <p className={styles.intro}>Enter the email or Ghana phone number registered to an active customer account.</p>
      <CustomerSecurityForm mode="request-reset" />
      <p className={styles.help}>Responses are deliberately non-specific to prevent account enumeration.</p>
    </section>
  </main>;
}
