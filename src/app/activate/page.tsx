import Link from "next/link";
import { CustomerSecurityForm } from "@/components/customer-security-form";
import styles from "@/app/login/login.module.css";

export default async function ActivateCustomerPage({ searchParams }: { searchParams: Promise<{ token?: string }> }) {
  const { token } = await searchParams;
  return <main className={styles.page}>
    <header className={styles.header}><Link className={styles.logo} href="/">ROVA<span>.</span></Link><Link className={styles.home} href="/login">Customer sign-in</Link></header>
    <section className={styles.content}>
      <p className={styles.eyebrow}>SECURE CUSTOMER ACTIVATION</p>
      <h1>Activate your account.</h1>
      <p className={styles.intro}>This single-use link verifies ownership of the contact selected during an approved customer application.</p>
      {token && token.length <= 256
        ? <CustomerSecurityForm mode="activate" token={token} />
        : <p className={styles.notice}>This activation link is missing or invalid. Request a new secure invitation through the approved application workflow.</p>}
      <p className={styles.help}>Activation does not enable live booking, dispatch or payment services.</p>
    </section>
  </main>;
}
