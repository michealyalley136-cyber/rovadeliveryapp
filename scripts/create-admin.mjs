import { hash } from "bcryptjs";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";

const roles = new Set(["SUPER_ADMIN", "OPERATIONS_ADMIN", "RECRUITMENT_AGENT", "VIEW_ONLY"]);
const { DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD, ADMIN_ROLE = "RECRUITMENT_AGENT" } = process.env;

if (!DATABASE_URL || !ADMIN_EMAIL || !ADMIN_NAME || !ADMIN_PASSWORD || !roles.has(ADMIN_ROLE)) {
  console.error("Set DATABASE_URL, ADMIN_EMAIL, ADMIN_NAME, ADMIN_PASSWORD and a valid ADMIN_ROLE.");
  process.exit(1);
}
if (ADMIN_PASSWORD.length < 14) {
  console.error("ADMIN_PASSWORD must be at least 14 characters.");
  process.exit(1);
}

const database = new PrismaClient({ adapter: new PrismaPg({ connectionString: DATABASE_URL }) });
try {
  const email = ADMIN_EMAIL.trim().toLocaleLowerCase("en");
  const existing = await database.adminUser.findUnique({ where: { email }, select: { id: true } });
  if (existing) {
    console.error("An administrator with this email already exists. Use the existing controlled account recovery process.");
    process.exitCode = 1;
  } else {
    const passwordHash = await hash(ADMIN_PASSWORD, 12);
    await database.adminUser.create({
      data: { email, fullName: ADMIN_NAME.trim(), passwordHash, role: ADMIN_ROLE },
    });
    console.log(`Created ${ADMIN_ROLE} account for ${email}.`);
  }
} catch (error) {
  console.error("Administrator provisioning failed.", error instanceof Error ? error.name : "UnknownError");
  process.exitCode = 1;
} finally {
  await database.$disconnect();
}
