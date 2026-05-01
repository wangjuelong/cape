import { useQuery } from "@tanstack/react-query";

import {
  fetchSearch,
  fetchSearchPrefixes,
  type SearchPrefix,
  type SearchResponse,
} from "@/lib/api/search";
import { fetchUpstreamSearchScrape } from "@/lib/api/upstream-search-scrape";

/**
 * Run a search query. Tries v3 `/api/v3/search/` first; falls back to
 * scraping upstream `/_upstream/analysis/search/?search=...` HTML when
 * the v3 endpoint is unavailable (vanilla CAPEv2 deploy).
 */
export function useSearch(rawQuery: string) {
  return useQuery<SearchResponse>({
    queryKey: ["search", rawQuery],
    enabled: rawQuery.trim().length > 0,
    staleTime: 30_000,
    retry: 0,
    queryFn: async () => {
      try {
        return await fetchSearch(rawQuery);
      } catch {
        const scraped = await fetchUpstreamSearchScrape(rawQuery);
        return {
          ok: scraped.ok,
          term: scraped.term,
          raw: scraped.raw,
          error: scraped.error,
          items: scraped.items,
        };
      }
    },
  });
}

// Static prefix list (matches upstream's index.html help table)
export const FALLBACK_SEARCH_PREFIXES: SearchPrefix[] = [
  // General & Metadata
  { prefix: "id", description: "Task ID (e.g., id:1)", group: "General & Metadata" },
  { prefix: "ids", description: "List of Task IDs (e.g., ids:1,2,3)", group: "General & Metadata" },
  {
    prefix: "options",
    description: "Task options (e.g., options:function=DllMain)",
    group: "General & Metadata",
  },
  {
    prefix: "tags_tasks",
    description: "Task tags (e.g., tags_tasks:mytag)",
    group: "General & Metadata",
  },
  {
    prefix: "package",
    description: "Analysis package (e.g., package:ps1)",
    group: "General & Metadata",
  },
  { prefix: "machinename", description: "Target Machine Name", group: "General & Metadata" },
  { prefix: "machinelabel", description: "Target Machine Label", group: "General & Metadata" },
  { prefix: "custom", description: "Custom data field", group: "General & Metadata" },
  { prefix: "comment", description: "Analysis Comments", group: "General & Metadata" },
  { prefix: "configs", description: "Extracted config value", group: "General & Metadata" },
  // File Properties & Static Analysis
  {
    prefix: "target_sha256",
    description: "Target file SHA256",
    group: "File Properties & Static Analysis",
  },
  { prefix: "name", description: "File name pattern", group: "File Properties & Static Analysis" },
  { prefix: "type", description: "File type/format", group: "File Properties & Static Analysis" },
  {
    prefix: "ssdeep",
    description: "Fuzzy hash (SSDeep)",
    group: "File Properties & Static Analysis",
  },
  { prefix: "crc32", description: "CRC32 hash", group: "File Properties & Static Analysis" },
  { prefix: "imphash", description: "PE Imphash", group: "File Properties & Static Analysis" },
  {
    prefix: "iconhash",
    description: "Exact icon hash",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "iconfuzzy",
    description: "Fuzzy icon hash",
    group: "File Properties & Static Analysis",
  },
  { prefix: "dhash", description: "Icon dhash", group: "File Properties & Static Analysis" },
  {
    prefix: "die",
    description: "Detect It Easy (DIE) signature (e.g., die:obsidium)",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "extracted_tool",
    description: "Extracted tool (e.g., InnoExtract)",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "virustotal",
    description: "VirusTotal Detected Name",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "clamav",
    description: "Local ClamAV detections",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "yaraname",
    description: "Yara Rule Name (binary folder)",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "capeyara",
    description: "Yara Rule Name (cape folder)",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "procdumpyara",
    description: "Yara Rule Name (process dumps)",
    group: "File Properties & Static Analysis",
  },
  {
    prefix: "procmemyara",
    description: "Yara Rule Name (memory dumps)",
    group: "File Properties & Static Analysis",
  },
  // Network Analysis
  { prefix: "ip", description: "Contacted IP address", group: "Network Analysis" },
  { prefix: "domain", description: "Contacted domain", group: "Network Analysis" },
  { prefix: "url", description: "Contacted URL or URL Analysis Target", group: "Network Analysis" },
  { prefix: "port", description: "Source or Destination port", group: "Network Analysis" },
  { prefix: "sport", description: "Source port", group: "Network Analysis" },
  { prefix: "dport", description: "Destination port", group: "Network Analysis" },
  { prefix: "ja3_string", description: "JA3 string", group: "Network Analysis" },
  { prefix: "ja3_hash", description: "JA3 hash", group: "Network Analysis" },
  { prefix: "asn", description: "AS ID (e.g., asn:AS15169)", group: "Network Analysis" },
  {
    prefix: "asn_name",
    description: "ASN name (e.g., asn_name:Google LLC)",
    group: "Network Analysis",
  },
  { prefix: "surimsg", description: "Suricata Alert Message", group: "Network Analysis" },
  { prefix: "surialert", description: "Suricata Alert Category", group: "Network Analysis" },
  { prefix: "surisid", description: "Suricata Alert SID", group: "Network Analysis" },
  { prefix: "suriurl", description: "Suricata HTTP URL", group: "Network Analysis" },
  { prefix: "suriua", description: "Suricata HTTP User-Agent", group: "Network Analysis" },
  { prefix: "surireferrer", description: "Suricata HTTP Referrer", group: "Network Analysis" },
  { prefix: "surihost", description: "Suricata HTTP Host", group: "Network Analysis" },
  { prefix: "suritlssubject", description: "Suricata TLS Subject", group: "Network Analysis" },
  { prefix: "suritlsissuerdn", description: "Suricata TLS Issuer DN", group: "Network Analysis" },
  {
    prefix: "suritlsfingerprint",
    description: "Suricata TLS Fingerprint",
    group: "Network Analysis",
  },
  { prefix: "suritls", description: "Suricata TLS Generic", group: "Network Analysis" },
  { prefix: "surihttp", description: "Suricata HTTP Generic", group: "Network Analysis" },
  // Behavior & Execution
  { prefix: "file", description: "Open files matching pattern", group: "Behavior & Execution" },
  {
    prefix: "command",
    description: "Executed commands matching pattern",
    group: "Behavior & Execution",
  },
  { prefix: "resolvedapi", description: "APIs resolved at runtime", group: "Behavior & Execution" },
  {
    prefix: "key",
    description: "Open registry keys matching pattern",
    group: "Behavior & Execution",
  },
  { prefix: "mutex", description: "Open mutexes matching pattern", group: "Behavior & Execution" },
  { prefix: "signame", description: "CAPE Signature names", group: "Behavior & Execution" },
  {
    prefix: "signature",
    description: "CAPE Signature descriptions",
    group: "Behavior & Execution",
  },
  { prefix: "detections", description: "Malware family detections", group: "Behavior & Execution" },
  { prefix: "malscore", description: "Malscore > value", group: "Behavior & Execution" },
  { prefix: "ttp", description: "TTP ID (e.g., T1053)", group: "Behavior & Execution" },
];

export function useSearchPrefixes() {
  return useQuery<SearchPrefix[]>({
    queryKey: ["search", "prefixes"],
    queryFn: async () => {
      try {
        return await fetchSearchPrefixes();
      } catch {
        return FALLBACK_SEARCH_PREFIXES;
      }
    },
    staleTime: 60 * 60 * 1000,
    retry: 0,
  });
}
