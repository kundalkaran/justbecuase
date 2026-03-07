"use client"

import { testimonials } from "@/lib/data"
import { Quote, ShieldCheck, Zap, Globe } from "lucide-react"
import { useDictionary } from "@/components/dictionary-provider"

export function Testimonials() {
  const dict = useDictionary()
  const home = dict.home || {}

  return (
    <section className="py-24 bg-[#FCFDFF]">
      <div className="container mx-auto px-6">
        {/* Modern Minimalist Header */}
        <div className="max-w-3xl mb-16">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-slate-100 border border-slate-200 mb-6">
            <Zap className="h-3 w-3 text-slate-900 fill-slate-900" />
            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-600">{home.theNetworkEffect || "The Network Effect"}</span>
          </div>
          <h2 className="text-4xl md:text-5xl font-semibold text-slate-900 tracking-tight mb-6">
            {home.testimonialsTitle || "Trusted by the architects of social change."}
          </h2>
          <p className="text-lg text-slate-500 font-light">
            {home.testimonialsSubtitle || "Real stories from professional impact agents and the NGOs they've helped scale."}
          </p>
        </div>

        {/* Bento Grid Layout */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
          {(testimonials as any[]).map((testimonial, index) => (
            <div 
              key={testimonial.id}
              className={`group relative overflow-hidden rounded-3xl border border-slate-200 bg-white p-8 transition-all duration-500 hover:shadow-[0_20px_50px_rgba(0,0,0,0.05)] hover:-translate-y-1 ${
                index === 0 ? "md:col-span-8 md:row-span-2" : 
                index === 1 ? "md:col-span-4" : 
                "md:col-span-4"
              }`}
            >
              {/* Top Row: Verification & Type */}
              <div className="flex justify-between items-start mb-8">
                <div className="flex items-center gap-2">
                  <div className="h-8 w-8 rounded-full bg-slate-50 flex items-center justify-center border border-slate-100">
                    <ShieldCheck className="h-4 w-4 text-slate-900" />
                  </div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{home.verified || "Verified"} {testimonial.type}</span>
                </div>
                {index === 0 && (
                  <div className="flex items-center gap-1 text-emerald-600 bg-emerald-50 px-2 py-1 rounded-md">
                    <Globe className="h-3 w-3" />
                    <span className="text-[9px] font-bold uppercase">{home.regionalImpact || "Regional Impact"}</span>
                  </div>
                )}
              </div>

              {/* The Quote - Dynamic sizing based on grid position */}
              <div className="relative">
                <Quote className="absolute -top-4 -left-2 h-12 w-12 text-slate-50 -z-10 group-hover:text-slate-100 transition-colors" />
                <p className={`${
                  index === 0 ? "text-2xl md:text-3xl" : "text-lg"
                } font-medium text-slate-800 leading-snug tracking-tight mb-10`}>
                  "{testimonial.quote}"
                </p>
              </div>

              {/* Skill Tags - Direct link to your platform's core logic */}
              <div className="flex flex-wrap gap-2 mb-8">
                {["UI/UX", "Strategy", "Impact"].map((tag) => (
                  <span key={tag} className="text-[9px] font-bold uppercase tracking-widest text-slate-400 border border-slate-100 px-2 py-0.5 rounded">
                    {tag}
                  </span>
                ))}
              </div>

              {/* Bottom Attribution */}
              <div className="flex items-center gap-4 border-t border-slate-50 pt-6">
                <div className="relative">
                  <img
                    src={testimonial.avatar || "/placeholder.svg"}
                    alt={testimonial.author}
                    className="w-12 h-12 rounded-2xl object-cover ring-4 ring-slate-50"
                  />
                  <div className="absolute -bottom-1 -right-1 h-4 w-4 bg-white rounded-full flex items-center justify-center shadow-sm">
                    <div className="h-2 w-2 bg-emerald-500 rounded-full animate-pulse" />
                  </div>
                </div>
                <div>
                  <p className="text-xs font-black uppercase tracking-wider text-slate-900">{testimonial.author}</p>
                  <p className="text-[11px] text-slate-400 font-medium">
                    {testimonial.role} <span className="text-slate-200 mx-1">/</span> {testimonial.organization}
                  </p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* CTA Link - To keep users moving */}
        <div className="mt-16 text-center">
          <button className="text-sm font-bold text-slate-900 border-b-2 border-slate-900 pb-1 hover:text-slate-500 hover:border-slate-500 transition-all">
            {home.seeMoreStories || "See more success stories →"}
          </button>
        </div>
      </div>
    </section>
  )
}