import { NextResponse } from "next/server";
import { applicationTypes } from "@/config/application-types";
import { getAuthorizedAdmin } from "@/server/admin-auth";
import { getDatabase } from "@/server/db";

const applicationStatuses = [
  "RECEIVED",
  "UNDER_REVIEW",
  "MORE_INFORMATION_REQUIRED",
  "PRE_QUALIFIED",
  "APPROVED_FOR_NEXT_STAGE",
  "WAITLISTED",
  "DECLINED",
] as const;

function csvCell(value: string) {
  const safe = /^[=+\-@]/.test(value) ? `'${value}` : value;
  return `"${safe.replaceAll('"', '""')}"`;
}

function maskContact(value: string | null) {
  if (!value) return null;
  return value.includes("@") ? `${value.slice(0, 1)}***@${value.split("@")[1]}` : `${value.slice(0, 4)}••••${value.slice(-2)}`;
}

export async function GET(request: Request) {
  let admin: Awaited<ReturnType<typeof getAuthorizedAdmin>>;
  try {
    admin = await getAuthorizedAdmin();
  } catch {
    return NextResponse.json({ error: "Admin storage is unavailable." }, { status: 503 });
  }
  if (!admin) return NextResponse.json({ error: "Admin access is required." }, { status: 401 });

  const params = new URL(request.url).searchParams;
  const page = Math.max(1, Math.min(500, Number(params.get("page") ?? 1) || 1));
  const search = params.get("search")?.trim().slice(0, 100);
  const type = params.get("type");
  const status = params.get("status");
  const city = params.get("city")?.trim().slice(0, 80);
  const isCsv = params.get("format") === "csv";
  if (type && !(applicationTypes as readonly string[]).includes(type)) return NextResponse.json({ error: "Invalid application type." }, { status: 400 });
  if (status && !(applicationStatuses as readonly string[]).includes(status)) return NextResponse.json({ error: "Invalid application status." }, { status: 400 });
  if (isCsv && admin.role === "VIEW_ONLY") return NextResponse.json({ error: "Your role cannot export applicant data." }, { status: 403 });

  const where = {
    ...(type ? { type: type as (typeof applicationTypes)[number] } : {}),
    ...(status ? { status: status as (typeof applicationStatuses)[number] } : {}),
    ...(city ? { applicant: { city: { equals: city, mode: "insensitive" as const } } } : {}),
    ...(search ? {
      OR: [
        { reference: { contains: search, mode: "insensitive" as const } },
        { applicant: { firstName: { contains: search, mode: "insensitive" as const } } },
        { applicant: { lastName: { contains: search, mode: "insensitive" as const } } },
        { applicant: { normalizedPhone: { contains: search.replace(/\D/g, "") || search } } },
        { applicant: { normalizedEmail: { contains: search.toLocaleLowerCase("en") } } },
      ],
    } : {}),
  };

  try {
    const database = getDatabase();
    if (isCsv) {
      const applications = await database.application.findMany({
        where,
        take: 5000,
        orderBy: { submittedAt: "desc" },
        include: { applicant: true },
      });
      const rows = [
        ["Reference", "Applicant", "Type", "Phone", "Email", "City", "Status", "Submitted"],
        ...applications.map((application) => [
          application.reference,
          `${application.applicant.firstName} ${application.applicant.lastName}`,
          application.type,
          application.applicant.phone,
          application.applicant.email ?? "",
          application.applicant.city,
          application.status,
          application.submittedAt.toISOString(),
        ]),
      ];
      return new Response(rows.map((row) => row.map(csvCell).join(",")).join("\r\n"), {
        headers: {
          "content-type": "text/csv; charset=utf-8",
          "content-disposition": 'attachment; filename="rova-applications.csv"',
          "cache-control": "no-store",
        },
      });
    }
    const [applications, total, statusCounts, typeCounts, todayCount] = await Promise.all([
      database.application.findMany({
        where,
        take: 25,
        skip: (page - 1) * 25,
        orderBy: { submittedAt: "desc" },
        select: {
          id: true,
          reference: true,
          type: true,
          status: true,
          submittedAt: true,
          assignedTo: true,
          applicant: { select: { firstName: true, lastName: true, phone: true, email: true, city: true } },
        },
      }),
      database.application.count({ where }),
      database.application.groupBy({ by: ["status"], _count: { _all: true } }),
      database.application.groupBy({ by: ["type"], _count: { _all: true } }),
      database.application.count({ where: { submittedAt: { gte: new Date(new Date().setHours(0, 0, 0, 0)) } } }),
    ]);
    const visibleApplications = admin.role === "VIEW_ONLY"
      ? applications.map((application) => ({
          ...application,
          applicant: {
            ...application.applicant,
            phone: maskContact(application.applicant.phone),
            email: maskContact(application.applicant.email),
          },
        }))
      : applications;
    return NextResponse.json({
      applications: visibleApplications,
      page,
      pageSize: 25,
      total,
      metrics: {
        total,
        newToday: todayCount,
        byStatus: Object.fromEntries(statusCounts.map((item) => [item.status, item._count._all])),
        byType: Object.fromEntries(typeCounts.map((item) => [item.type, item._count._all])),
      },
    }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    const name = error instanceof Error ? error.name : "UnknownError";
    console.error("ROVA admin applications query failed", { error: name });
    return NextResponse.json({ error: "Applications could not be loaded. Please try again." }, { status: 503 });
  }
}
