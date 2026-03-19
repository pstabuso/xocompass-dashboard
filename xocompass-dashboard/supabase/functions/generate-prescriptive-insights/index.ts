import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders })
  }

  try {
    const { ragContext } = await req.json()

    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? ''
    )

    // RAG RETRIEVAL: Fetch KJS business rules from the database
    let businessContext = `KJS International Travel & Tours — Operational Constraints:
- Fleet capacity: max 25 vans per operational day (SDG 8 compliance)
- Base booking revenue: ₱48,000 per booking
- Surge premium floor: 30% above base rate = ₱62,400/seat (SDG 9 mandate)
- Bulk wholesale procurement: 6-month advance procurement required for discount eligibility
- Waste margin target: <5% oversupply per procurement cycle (SDG 12 mandate)
- DOLE compliance: No sustained driver overtime beyond fleet saturation
- Market: Philippines domestic & outbound tourism, peak seasons April & December`

    try {
      const { data: rules } = await supabaseAdmin
        .from('kjs_procurement_rules')
        .select('context')
      if (rules && rules.length > 0) {
        businessContext = rules.map((r: { context: string }) => r.context).join('\n')
      }
    } catch (_e) {
      // Table not yet seeded — use embedded defaults above
    }

    const systemPrompt = `You are the Chief Financial Engineer for KJS International Travel & Tours (Philippines). Your SARIMAX Decision Support System (XoCompass) has just completed analysis for a specific pipeline stage. Generate ruthless, analytically precise executive directives — no pleasantries, pure signal with specific numbers.

BUSINESS CONSTRAINTS (NON-NEGOTIABLE):
${businessContext}

Format rules:
- Use ▶ for major insight headers
- Use ► for action directives
- No generic filler — every sentence must cite a specific number or business rule
- Tone: analytical, precise, direct
- Length: 250-350 words`

    const userPrompt = `CURRENT PIPELINE STAGE: ${ragContext.stage}

RETRIEVED ANALYSIS DATA:
${JSON.stringify(ragContext.data, null, 2)}

GENERATE: A structured executive intelligence brief with:
1. Data-specific citations (use actual numbers from the analysis data above)
2. Concrete operational directives (exact seat counts, peso values, procurement timing)
3. Risk quantification (downside scenarios, exposure bounds, mitigation protocols)
4. SDG alignment mapping where applicable to this stage
5. 3-4 actionable directives prefixed with ►`

    const anthropicResponse = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': Deno.env.get('ANTHROPIC_API_KEY') ?? '',
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 700,
        system: systemPrompt,
        messages: [{ role: 'user', content: userPrompt }]
      })
    })

    if (!anthropicResponse.ok) {
      throw new Error(`Anthropic API error: ${anthropicResponse.status}`)
    }

    const result = await anthropicResponse.json()
    const insight = result.content?.[0]?.text ?? 'Insight generation failed.'

    return new Response(
      JSON.stringify({ insight }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (error) {
    return new Response(
      JSON.stringify({ error: (error as Error).message }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )
  }
})
