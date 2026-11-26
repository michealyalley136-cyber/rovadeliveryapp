import Link from "next/link";
import { CustomerSecurityForm } from "@/components/customer-security-form";
import styles from "@/app/login/login.module.css";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.logo} href="/">ROVA<span>.</span></Link><Link className={styles.home} href="/login">Customer sign-in</Link></header>
    <section className={styles.content}>
      <p className={styles.eyebrow}>CUSTOMER ACCOUNT RECOVERY</p>
      <h1>Choose a new password.</h1>
      <p className={styles.intro}>A successful reset revokes existing customer sessions.</p>
      {token && token.length <= 256
        ? <CustomerSecurityForm mode="reset" token={token} />
        : <p className={styles.notice}>This password reset link is missing or invalid. Request a new link.</p>}
      <p className={styles.help}><Link href="/forgot-password">Request another reset link</Link></p>
    </section>
  </main>;
}
