import Link from "next/link";

export default function HomePage() {
	return (
		<main className="mx-auto flex min-h-screen w-full max-w-4xl items-center px-6 py-16">
			<section className="w-full rounded-2xl border border-slate-200 bg-white/80 p-8 shadow-sm backdrop-blur">
				<p className="mb-3 inline-flex rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-sky-700">
					Phase 1 Setup
				</p>
				<h1 className="text-3xl font-bold text-slate-900">Social Media Scheduler</h1>
				<p className="mt-3 max-w-2xl text-slate-600">
					Next.js, TypeScript, and Tailwind CSS are configured. MongoDB connectivity is ready through Mongoose in
					src/lib/db.ts.
				</p>
				<div className="mt-6">
					<Link
						href="/dashboard"
						className="inline-flex rounded-xl border border-cyan-700 bg-cyan-700 px-5 py-3 text-sm font-semibold text-white hover:bg-cyan-800"
					>
						Open Composer Dashboard
					</Link>
				</div>
			</section>
		</main>
	);
}
