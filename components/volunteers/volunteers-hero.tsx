import { UnifiedSearchBar } from "@/components/unified-search-bar"

export function VolunteersHero() {
  return (
    <div className="bg-gradient-to-r from-primary/10 to-secondary/10 py-12">
      <div className="container mx-auto px-4 md:px-6">
        <div className="max-w-3xl mx-auto text-center">
          <h1 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
            Find Skilled Impact Agents
          </h1>
          <p className="text-lg text-muted-foreground mb-8">
            Connect with talented professionals ready to contribute their skills to your cause
          </p>
          
          <div className="max-w-xl mx-auto">
            <UnifiedSearchBar
              defaultType="volunteer"
              allowedTypes={["volunteer"]}
              variant="hero"
              placeholder="Search by skills, location, or name..."
              showPopularTags
            />
          </div>
        </div>
      </div>
    </div>
  )
}
