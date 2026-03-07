// Sample data for the platform
export const sampleProjects = [
  {
    id: "3",
    title: "Grant Writing Support",
    ngo: {
      name: "Healthcare Access Initiative",
      logo: "/medical-cross-logo.png",
      verified: true,
    },
    description:
      "Support our team in writing grant proposals to secure funding for mobile health clinics in rural areas.",
    skills: ["Grant Writing", "Research", "Nonprofit Finance"],
    timeCommitment: "15-20 hours",
    projectType: "short-term",
    location: "Virtual",
    deadline: "Dec 20, 2025",
    applicants: 5,
    status: "active",
  },
  {
    id: "4",
    title: "Brand Identity Design",
    ngo: {
      name: "Youth Empowerment Network",
      logo: "/youth-star-logo.jpg",
      verified: false,
    },
    description:
      "Create a fresh brand identity including logo, color palette, and brand guidelines for our youth programs.",
    skills: ["Branding", "Graphic Design", "Visual Identity"],
    timeCommitment: "20-30 hours",
    projectType: "short-term",
    location: "Singapore",
    deadline: "Jan 10, 2026",
    applicants: 15,
    status: "active",
  },
  {
    id: "5",
    title: "Financial Planning Consultation",
    ngo: {
      name: "Community Food Bank",
      logo: "/food-heart-logo.jpg",
      verified: true,
    },
    description:
      "One-hour consultation to review our financial planning and provide recommendations for sustainable growth.",
    skills: ["Finance", "Strategic Planning", "Nonprofit Management"],
    timeCommitment: "1-2 hours",
    projectType: "consultation",
    location: "Virtual",
    deadline: "Dec 5, 2025",
    applicants: 3,
    status: "active",
  },
  {
    id: "6",
    title: "Legal Document Review",
    ngo: {
      name: "Animal Welfare Society",
      logo: "/paw-print-logo.png",
      verified: true,
    },
    description: "Review and update our impact agent agreements and liability waivers to ensure legal compliance.",
    skills: ["Legal", "Contract Review", "Compliance"],
    timeCommitment: "5-10 hours",
    projectType: "short-term",
    location: "Virtual",
    deadline: "Dec 25, 2025",
    applicants: 2,
    status: "active",
  },
]

export const sampleVolunteers = [
  {
    id: "1",
    name: "Sarah Chen",
    avatar: "/asian-woman-professional-headshot.png",
    location: "Singapore",
    headline: "Senior Marketing Manager | Pro Bono Consultant",
    skills: ["Marketing", "Social Media", "Brand Strategy"],
    rating: 4.9,
    completedProjects: 12,
    hoursContributed: 156,
  },
  {
    id: "2",
    name: "David Kim",
    avatar: "/korean-man-headshot.png",
    location: "Seoul, South Korea",
    headline: "Full-Stack Developer | Tech for Good Advocate",
    skills: ["Web Development", "React", "Node.js"],
    rating: 5.0,
    completedProjects: 8,
    hoursContributed: 240,
  },
  {
    id: "3",
    name: "Priya Sharma",
    avatar: "/indian-woman-professional-headshot.png",
    location: "Mumbai, India",
    headline: "Finance Director | Nonprofit Board Member",
    skills: ["Finance", "Fundraising", "Strategic Planning"],
    rating: 4.8,
    completedProjects: 15,
    hoursContributed: 180,
  },
]

export const sampleNGOs = [
  {
    id: "1",
    name: "Green Earth Foundation",
    logo: "/green-earth-environmental-logo.jpg",
    location: "Jakarta, Indonesia",
    mission: "Protecting biodiversity and promoting sustainable practices worldwide.",
    causes: ["Environment", "Climate Action", "Sustainability"],
    verified: true,
    projectsCompleted: 24,
    volunteersEngaged: 89,
  },
  {
    id: "2",
    name: "Teach For Tomorrow",
    logo: "/education-learning-logo.jpg",
    location: "Manila, Philippines",
    mission: "Providing quality education to underserved communities through innovative learning programs.",
    causes: ["Education", "Youth Development", "Community"],
    verified: true,
    projectsCompleted: 45,
    volunteersEngaged: 156,
  },
]

export const skillCategories = [
  { name: "Digital Marketing", icon: "Megaphone", count: 45 },
  { name: "Website & App Development", icon: "Code", count: 52 },
  { name: "Content Creation & Design", icon: "Palette", count: 38 },
  { name: "Communication & Writing", icon: "MessageSquare", count: 32 },
  { name: "Fundraising Assistance", icon: "Heart", count: 28 },
  { name: "Finance & Accounting", icon: "Calculator", count: 24 },
  { name: "Planning & Operations", icon: "Users", count: 22 },
  { name: "Legal & Compliance", icon: "Scale", count: 15 },
  { name: "Data & Technology", icon: "Laptop", count: 18 },
]

export const impactMetrics = {
  volunteers: 2847,
  projectsCompleted: 456,
  ngosSupported: 128,
  hoursContributed: 34500,
  valueGenerated: 2450000,
}

export const testimonials = [
  // Testimonials go here
]
