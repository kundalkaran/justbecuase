/**
 * Deep debug: hit the LIVE API and check how client-side cross-referencing works
 * Simulates what find-talent-client.tsx does when filtering volunteers
 * 
 * Run: bunx tsx scripts/test-live-api.ts
 */

const BASE_URL = "https://justbecausenetwork.com"
const QUERY = "web designer 10 year experience"

async function main() {
  console.log("=".repeat(80))
  console.log("  DEEP DEBUG — API response + client-side cross-referencing")
  console.log("=".repeat(80))

  // 1. Call the unified-search API (same as the client does)
  const url = `${BASE_URL}/api/unified-search?q=${encodeURIComponent(QUERY)}&types=volunteer&limit=50`
  console.log(`\n📡 API call: ${url}`)
  
  const resp = await fetch(url)
  const data = await resp.json()
  
  if (!data.success) {
    console.log("❌ API failed:", data)
    return
  }

  const results = data.results || []
  console.log(`\n📦 API returned ${results.length} results (engine: ${data.engine})`)
  
  // 2. Show ALL 3 ID fields for each result — this is what the client extracts
  console.log(`\n${"─".repeat(80)}`)
  console.log("  API RESULT IDs (what the client receives)")
  console.log(`${"─".repeat(80)}`)
  
  for (let i = 0; i < results.length; i++) {
    const r = results[i]
    // Client code: r.userId || r.mongoId || r.id
    const extractedId = r.userId || r.mongoId || r.id
    console.log(`  [${i+1}] "${r.title}" score=${r.score}`)
    console.log(`       r.id="${r.id}" | r.mongoId="${r.mongoId}" | r.userId="${r.userId || "UNDEFINED"}"`)
    console.log(`       → Client extracts ID: "${extractedId}"`)
    console.log(`       Skills: ${(r.skills || []).slice(0, 3).join(", ")}`)
  }

  // 3. Client builds unifiedMatchedIds = results.map(r => r.userId || r.mongoId || r.id)
  const unifiedMatchedIds = results.map((r: any) => r.userId || r.mongoId || r.id)
  console.log(`\n📋 unifiedMatchedIds (${unifiedMatchedIds.length}):`)
  for (const id of unifiedMatchedIds) {
    console.log(`   "${id}"`)
  }

  // 4. The pre-loaded volunteer list uses v.userId || v.id
  //    from page.tsx: id: v.id || "", userId: v.id
  //    where v.id comes from getVolunteerProfileView → id: volunteerProfile.userId
  //    and volunteerProfile.userId = user._id.toString()
  //    
  //    The cross-reference check:
  //    const volunteerId = v.userId || v.id
  //    if (!unifiedMatchedIds.includes(volunteerId)) matches = false
  console.log(`\n${"─".repeat(80)}`)
  console.log("  ID CROSS-REFERENCE ANALYSIS")
  console.log(`${"─".repeat(80)}`)
  
  // Check if any userId is undefined/null
  const undefinedUserIds = results.filter((r: any) => !r.userId)
  console.log(`\n  Results with UNDEFINED userId: ${undefinedUserIds.length} of ${results.length}`)
  if (undefinedUserIds.length > 0) {
    console.log(`  ⚠️ When userId is undefined, client falls back to r.mongoId || r.id`)
    for (const r of undefinedUserIds) {
      console.log(`     "${r.title}": mongoId="${r.mongoId}" id="${r.id}" → uses "${r.mongoId || r.id}"`)
    }
  }

  // 5. Check if mongoId and id are always the same
  const mismatchedIds = results.filter((r: any) => r.mongoId !== r.id)
  console.log(`\n  Results where mongoId ≠ id: ${mismatchedIds.length}`)
  for (const r of mismatchedIds) {
    console.log(`     "${r.title}": mongoId="${r.mongoId}" ≠ id="${r.id}"`)
  }

  // 6. Now the REAL question: are these IDs the user._id.toString() values?
  //    If ES syncs from "user" collection, doc._id IS the user ID.
  //    So esDoc.mongoId = doc._id.toString() = user's Better Auth ID (24-hex).
  //    And the page loads via browseVolunteers → findMany → userId: u._id.toString()
  //    So both should be the same 24-hex string.
  console.log(`\n  ID format check:`)
  for (const r of results) {
    const id = r.userId || r.mongoId || r.id
    const is24Hex = /^[0-9a-f]{24}$/.test(id)
    if (!is24Hex) {
      console.log(`     ⚠️ "${r.title}": ID "${id}" is NOT a 24-hex ObjectId!`)
    }
  }
  const all24Hex = results.every((r: any) => /^[0-9a-f]{24}$/.test(r.userId || r.mongoId || r.id))
  console.log(`  All IDs are 24-hex ObjectIds: ${all24Hex ? "✅ YES" : "❌ NO"}`)

  // 7. KEY INSIGHT: If the deployment is still on the OLD code (before our last push),
  //    the userId field will be undefined because the old es-sync.ts reads from "user"
  //    collection where doc.userId doesn't exist.
  //    In that case: r.userId = undefined → falls back to r.mongoId (which IS the user._id)
  //    Pre-loaded volunteer: v.userId = v.id = user._id.toString()
  //    So the IDs SHOULD still match even with undefined userId.
  //
  //    BUT WAIT: What if the deployment didn't finish building yet?
  //    Let me check the Vercel deployment status...
  
  console.log(`\n${"─".repeat(80)}`)
  console.log("  DEPLOYMENT CHECK")
  console.log(`${"─".repeat(80)}`)

  // Check if the latest code changes are deployed by looking at search engine behavior
  // Our latest changes added "web designer" to ROLE_TO_SKILLS which changes scoring.
  // If Vikas (expert, website skills) is #1 with score ~64, that means our synonym
  // boosts ARE in effect (because the old code wouldn't boost like that).
  const topResult = results[0]
  console.log(`  Top result: "${topResult?.title}" score=${topResult?.score}`)
  console.log(`  Engine: ${data.engine}`)
  
  // Check if scores suggest synonym boosting is active
  const scoresDecreasing = results.every((r: any, i: number, arr: any[]) => 
    i === 0 || r.score <= arr[i-1].score
  )
  console.log(`  Scores monotonically decreasing: ${scoresDecreasing ? "✅" : "❌"}`)
  
  // 8. FINAL HYPOTHESIS: The real problem may be that the UI screenshot was taken
  //    BEFORE our deployment went live. Let me check if the visible volunteers in
  //    the screenshot (Parameshwari C, Nandeep koutil, Anupriya Ashtekar, Rani S)
  //    are in the API results.
  const namesInScreenshot = ["Parameshwari", "Nandeep", "Anupriya", "Rani S"]
  console.log(`\n  Screenshot volunteers in API results?`)
  for (const name of namesInScreenshot) {
    const found = results.find((r: any) => r.title?.includes(name))
    console.log(`    "${name}": ${found ? `✅ YES (score=${found.score})` : "❌ NOT IN RESULTS"}`)
  }
  
  // These ARE in the screenshot AND in the API results
  const namesCorrect = ["Vikas", "Kavyashree"]
  for (const name of namesCorrect) {
    const found = results.find((r: any) => r.title?.includes(name))
    console.log(`    "${name}": ${found ? `✅ YES (score=${found.score})` : "❌ NOT IN RESULTS"}`)
  }

  console.log(`\n${"─".repeat(80)}`)
  console.log("  FULL RESULT LIST")
  console.log(`${"─".repeat(80)}`)
  for (const r of results) {
    const skills = (r.skills || []).slice(0, 4).join(", ")
    console.log(`  [score=${String(r.score).padEnd(10)}] "${r.title}" — ${skills}`)
  }

  console.log("\n\nDone.")
}

main().catch(console.error)
