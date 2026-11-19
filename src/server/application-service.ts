import "server-only";
import { randomUUID } from "node:crypto";
import type { ApplicationType } from "@/config/application-types";
import { applicationTypeOptions } from "@/config/application-types";
import { getDatabase } from "@/server/db";

export async function createApplication(input: {
  type: ApplicationType;
  firstName: string;
  lastName: string;
  phone: string;
  whatsapp: string | null;
  email: string | null;
  city: string;
  area: string | null;
  data: Record<string, string | string[]>;
}) {
  const database = getDatabase();
  const typeInfo = applicationTypeOptions.find((option) => option.type === input.type);
  if (!typeInfo) throw new Error("Unsupported application type.");

  return database.$transaction(async (transaction) => {
    const applicant = await transaction.applicant.create({
      data: {
        firstName: input.firstName,
        lastName: input.lastName,
        phone: input.phone,
        normalizedPhone: input.phone,
        whatsapp: input.whatsapp,
        email: input.email,
        normalizedEmail: input.email?.toLocaleLowerCase("en"),
        city: input.city,
        area: input.area,
      },
      select: { id: true },
    });

    const application = await transaction.application.create({
      data: {
        reference: `PENDING-${randomUUID()}`,
        applicantId: applicant.id,
        type: input.type,
        status: "RECEIVED",
        data: input.data,
        consentAt: new Date(),
        history: { create: { previousStatus: null, newStatus: "RECEIVED", reason: "Application submitted." } },
      },
      select: { id: true },
    });
    const reference = `ROVA-${typeInfo.prefix}-${String(application.id).padStart(6, "0")}`;
    await transaction.application.update({ where: { id: application.id }, data: { reference } });
    return { reference };
  });
}

export async function lookupApplication(reference: string, contact: { phone?: string; email?: string }) {
  const database = getDatabase();
  const normalizedEmail = contact.email?.trim().toLocaleLowerCase("en");
  const normalizedPhone = contact.phone;
  const application = await database.application.findFirst({
    where: {
      reference: reference.trim().toUpperCase(),
      applicant: {
        OR: [
          ...(normalizedEmail ? [{ normalizedEmail }] : []),
          ...(normalizedPhone ? [{ normalizedPhone }] : []),
        ],
      },
    },
    select: { reference: true, type: true, status: true, submittedAt: true },
  });
  return application;
}
