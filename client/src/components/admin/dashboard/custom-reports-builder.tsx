import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useToast } from "@/hooks/use-toast";
import { Download, Play, Plus, Save, Trash2 } from "lucide-react";
import { useTranslation } from "react-i18next";

type FieldType = "text" | "number" | "boolean" | "date" | "datetime";
type Operator = string;
type Field = { key: string; label: string; type: FieldType; operators: Operator[]; aggregatable?: boolean };
type Source = { key: string; label: string; description: string; defaultFields: string[]; fields: Field[] };
type Definition = {
  source: string;
  fields: string[];
  filters: { field: string; operator: string; value?: unknown; valueTo?: unknown }[];
  groupBy: string[];
  sort?: { field: string; direction: "asc" | "desc" };
  aggregations: { field: string; function: string }[];
};
type ReportResult = {
  rows: Record<string, unknown>[];
  columns: { key: string; label: string; type: FieldType }[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
type SavedReport = { id: string; name: string; definition: Definition };

const OPERATOR_LABELS: Record<string, string> = {
  eq: "equals", neq: "not_equal", contains: "contains", starts_with: "starts_with",
  in: "one_of", gt: "greater_than", gte: "at_least", lt: "less_than", lte: "at_most",
  between: "between", is_null: "empty", is_not_null: "not_empty",
};

const AGGREGATIONS = ["COUNT", "SUM", "AVG", "MIN", "MAX"];

function emptyDefinition(source?: Source): Definition {
  const fields = source?.defaultFields ?? [];
  return { source: source?.key ?? "", fields, filters: [], groupBy: [], aggregations: [] };
}

function displayValue(value: unknown, type: FieldType, t: (key: string, fallback: string) => string): string {
  if (value === null || value === undefined) return "—";
  if (type === "boolean") return value ? t("common.yes", "Yes") : t("common.no", "No");
  if (type === "number" && typeof value === "number") return value.toLocaleString();
  if (type === "datetime") {
    const parsed = new Date(String(value));
    if (!Number.isNaN(parsed.valueOf())) return parsed.toLocaleString();
  }
  return String(value);
}

export function CustomReportsBuilder() {
  const { t } = useTranslation();
  const translate = (key: string, fallback: string, options?: Record<string, unknown>) =>
    String(t(key, { defaultValue: fallback, ...options }));
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const metadataQuery = useQuery<{ sources: Source[] }>({
    queryKey: ["/api/admin/custom-reports/metadata"],
  });
  const savedQuery = useQuery<SavedReport[]>({
    queryKey: ["/api/admin/custom-reports/saved"],
  });
  const [definition, setDefinition] = useState<Definition>(emptyDefinition());
  const [sourceInitialized, setSourceInitialized] = useState(false);
  const [fieldSearch, setFieldSearch] = useState("");
  const [reportName, setReportName] = useState("");
  const [loadedReportId, setLoadedReportId] = useState("");
  const [selectedSavedId, setSelectedSavedId] = useState("");
  const [result, setResult] = useState<ReportResult | null>(null);
  const [page, setPage] = useState(1);

  const sources = metadataQuery.data?.sources ?? [];
  const source = sources.find(item => item.key === definition.source);
  const fields = source?.fields ?? [];
  const fieldMap = useMemo(() => new Map(fields.map(item => [item.key, item])), [fields]);
  const localize = (key: string, fallback: string) => translate(`admin_tools.custom.metadata.${key}`, fallback);
  const visibleFields = fields.filter(item => localize(item.key, item.label).toLowerCase().includes(fieldSearch.toLowerCase()));

  useEffect(() => {
    if (!sourceInitialized && sources.length) {
      const first = sources[0];
      setDefinition(emptyDefinition(first));
      setSourceInitialized(true);
    }
  }, [sourceInitialized, sources]);

  const previewMutation = useMutation({
    mutationFn: async (payload: { definition: Definition; page: number }) => {
      const response = await apiRequest("POST", "/api/admin/custom-reports/query", { ...payload, limit: 50 });
      return response.json() as Promise<ReportResult>;
    },
    onSuccess: data => setResult(data),
     onError: (error: Error) => toast({ title: t("admin_tools.custom.report_run_failed", "Report could not run"), description: error.message, variant: "destructive" }),
  });

  const saveMutation = useMutation({
    mutationFn: async (payload: { id?: string; name: string; definition: Definition }) => {
      const url = payload.id ? `/api/admin/custom-reports/saved/${payload.id}` : "/api/admin/custom-reports/saved";
      const response = await apiRequest(payload.id ? "PATCH" : "POST", url, {
        name: payload.name,
        definition: payload.definition,
      });
      return response.json() as Promise<SavedReport>;
    },
    onSuccess: data => {
      setLoadedReportId(data.id);
      setReportName(data.name);
      setSelectedSavedId(data.id);
      queryClient.invalidateQueries({ queryKey: ["/api/admin/custom-reports/saved"] });
       toast({ title: t("admin_tools.custom.report_saved", "Report saved") });
    },
     onError: (error: Error) => toast({ title: t("admin_tools.custom.report_save_failed", "Report could not be saved"), description: error.message, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest("DELETE", `/api/admin/custom-reports/saved/${id}`);
    },
    onSuccess: () => {
      setLoadedReportId("");
      setSelectedSavedId("");
      setReportName("");
      queryClient.invalidateQueries({ queryKey: ["/api/admin/custom-reports/saved"] });
       toast({ title: t("admin_tools.custom.report_deleted", "Saved report deleted") });
    },
     onError: (error: Error) => toast({ title: t("admin_tools.custom.report_delete_failed", "Report could not be deleted"), description: error.message, variant: "destructive" }),
  });

  const changeSource = (key: string) => {
    const next = sources.find(item => item.key === key);
    if (next) {
      setDefinition(emptyDefinition(next));
      setResult(null);
      setLoadedReportId("");
      setReportName("");
      setPage(1);
    }
  };

  const toggleField = (key: string) => {
    setDefinition(current => ({
      ...current,
      fields: current.fields.includes(key) ? current.fields.filter(item => item !== key) : [...current.fields, key],
      groupBy: current.groupBy.filter(item => item !== key),
    }));
  };

  const addFilter = () => {
    const first = fields[0];
    if (!first) return;
    setDefinition(current => ({
      ...current,
      filters: [...current.filters, { field: first.key, operator: first.operators[0] }],
    }));
  };

  const addAggregation = () => {
    setDefinition(current => ({
      ...current,
      groupBy: current.groupBy.length ? current.groupBy : current.fields,
      aggregations: [...current.aggregations, { function: "COUNT", field: "__all__" }],
    }));
  };

  const buildDefinition = (): Definition => ({
    ...definition,
    filters: definition.filters.map(filter => {
      if (filter.operator === "in" && typeof filter.value === "string") {
        return { ...filter, value: filter.value.split(",").map(item => item.trim()).filter(Boolean) };
      }
      return filter;
    }),
  });

  const runPreview = () => {
    setPage(1);
    previewMutation.mutate({ definition: buildDefinition(), page: 1 });
  };

  const changePage = (nextPage: number) => {
    setPage(nextPage);
    previewMutation.mutate({ definition: buildDefinition(), page: nextPage });
  };

  const loadSelected = () => {
    const saved = savedQuery.data?.find(item => item.id === selectedSavedId);
    if (!saved) return;
    const savedSource = sources.find(item => item.key === saved.definition.source);
    if (!savedSource) {
       toast({ title: t("admin_tools.custom.unavailable_source", "This report uses an unavailable data source"), variant: "destructive" });
      return;
    }
    setDefinition(saved.definition);
    setLoadedReportId(saved.id);
    setReportName(saved.name);
    setResult(null);
  };

  const exportCsv = async () => {
    try {
      const response = await apiRequest("POST", "/api/admin/custom-reports/export/csv", { definition: buildDefinition() });
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${(reportName || "custom-report").replace(/[^a-z0-9-_]+/gi, "-")}.csv`;
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (error: any) {
       toast({ title: t("admin_tools.custom.export_failed", "Export failed"), description: error.message, variant: "destructive" });
    }
  };

   if (metadataQuery.isLoading) return <div className="p-6 text-sm text-muted-foreground">{t("admin_tools.custom.loading", "Loading report builder…")}</div>;
   if (metadataQuery.isError) return <div className="p-6 text-sm text-destructive">{t("admin_tools.custom.load_failed", "The report builder could not load.")}</div>;

  return (
    <div className="space-y-4" data-testid="custom-reports-builder">
      <div>
         <h2 className="text-2xl font-semibold">{t("admin_tools.custom.title", "Custom Reports")}</h2>
         <p className="text-sm text-muted-foreground">{t("admin_tools.custom.description", "Build safe, reusable reports from approved admin data sources.")}</p>
      </div>

      <Card>
        <CardHeader className="pb-3">
           <CardTitle className="text-base">{t("admin_tools.custom.definition", "Report definition")}</CardTitle>
           <CardDescription>{t("admin_tools.custom.definition_desc", "Only approved fields and relationships are available. Results remain country-scoped.")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <div className="space-y-2">
               <Label htmlFor="custom-report-source">{t("admin_tools.custom.data_source", "Data source")}</Label>
               <select id="custom-report-source" value={definition.source} onChange={event => changeSource(event.target.value)} className="h-10 w-full rounded-md border bg-background px-3 text-sm">
                 {sources.map(item => <option key={item.key} value={item.key}>{localize(item.key, item.label)}</option>)}
              </select>
               <p className="text-xs text-muted-foreground">{source && localize(`${source.key}_description`, source.description)}</p>
            </div>
            <div className="space-y-2">
               <Label>{t("admin_tools.custom.saved_reports", "Saved reports")}</Label>
              <div className="flex gap-2">
                <select value={selectedSavedId} onChange={event => setSelectedSavedId(event.target.value)} className="h-10 min-w-0 flex-1 rounded-md border bg-background px-3 text-sm">
                   <option value="">{t("admin_tools.custom.choose_saved", "Choose a saved report…")}</option>
                  {(savedQuery.data ?? []).map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
                </select>
                 <Button variant="outline" onClick={loadSelected} disabled={!selectedSavedId}>{t("common.load", "Load")}</Button>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-3">
              <div className="mb-2 flex items-center justify-between">
                 <Label>{t("admin_tools.custom.available_fields", "Available fields")}</Label>
                 <span className="text-xs text-muted-foreground">{t("admin_tools.custom.selected", "{{count}} selected", { count: definition.fields.length })}</span>
              </div>
               <Input value={fieldSearch} onChange={event => setFieldSearch(event.target.value)} placeholder={t("admin_tools.custom.search_fields", "Search fields…")} className="mb-2" />
              <div className="grid max-h-64 gap-1 overflow-y-auto pr-1 sm:grid-cols-2">
                {visibleFields.map(item => (
                  <label key={item.key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                    <input type="checkbox" checked={definition.fields.includes(item.key)} onChange={() => toggleField(item.key)} />
                     <span>{localize(item.key, item.label)}</span>
                  </label>
                ))}
              </div>
            </div>
            <div className="rounded-lg border p-3">
               <Label>{t("admin_tools.custom.group_by", "Group by")}</Label>
               <p className="mb-2 mt-1 text-xs text-muted-foreground">{t("admin_tools.custom.group_by_desc", "Choose selected fields when using COUNT or another aggregation.")}</p>
              <div className="grid max-h-52 gap-1 overflow-y-auto sm:grid-cols-2">
                {definition.fields.map(key => {
                  const item = fieldMap.get(key);
                  return item ? (
                    <label key={key} className="flex cursor-pointer items-center gap-2 rounded px-2 py-1.5 text-sm hover:bg-muted">
                      <input type="checkbox" checked={definition.groupBy.includes(key)} onChange={() => setDefinition(current => ({ ...current, groupBy: current.groupBy.includes(key) ? current.groupBy.filter(value => value !== key) : [...current.groupBy, key] }))} />
                     <span>{localize(item.key, item.label)}</span>
                    </label>
                  ) : null;
                })}
              </div>
            </div>
          </div>

          <div className="rounded-lg border p-3">
               <div className="mb-3 flex items-center justify-between">
               <div><Label>{t("admin_tools.custom.filters", "Filters")}</Label><p className="text-xs text-muted-foreground">{t("admin_tools.custom.filters_desc", "Filters are typed and parameterized on the server.")}</p></div>
               <Button size="sm" variant="outline" onClick={addFilter}><Plus className="mr-1 h-3.5 w-3.5" />{t("admin_tools.custom.add_filter", "Add filter")}</Button>
            </div>
            <div className="space-y-2">
              {definition.filters.map((filter, index) => {
                const filterField = fieldMap.get(filter.field);
                const operators = filterField?.operators ?? [];
                const showValue = !["is_null", "is_not_null"].includes(filter.operator);
                return (
                  <div key={`${filter.field}-${index}`} className="grid gap-2 md:grid-cols-[1.2fr_1fr_1.5fr_1.5fr_auto]">
                    <select value={filter.field} onChange={event => setDefinition(current => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { field: event.target.value, operator: fieldMap.get(event.target.value)?.operators[0] ?? "eq" } : item) }))} className="h-9 rounded-md border bg-background px-2 text-sm">
                       {fields.map(item => <option key={item.key} value={item.key}>{localize(item.key, item.label)}</option>)}
                    </select>
                    <select value={filter.operator} onChange={event => setDefinition(current => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, operator: event.target.value } : item) }))} className="h-9 rounded-md border bg-background px-2 text-sm">
                       {operators.map(operator => <option key={operator} value={operator}>{translate(`admin_tools.custom.operator_${OPERATOR_LABELS[operator] ?? operator}`, operator.replace(/_/g, " "))}</option>)}
                    </select>
                     {showValue ? <Input value={Array.isArray(filter.value) ? filter.value.join(", ") : String(filter.value ?? "")} onChange={event => setDefinition(current => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, value: event.target.value } : item) }))} placeholder={filterField?.type === "number" ? t("admin_tools.custom.number", "Number") : t("admin_tools.custom.value", "Value")} /> : <div />}
                     {filter.operator === "between" ? <Input value={String(filter.valueTo ?? "")} onChange={event => setDefinition(current => ({ ...current, filters: current.filters.map((item, itemIndex) => itemIndex === index ? { ...item, valueTo: event.target.value } : item) }))} placeholder={t("admin_tools.custom.and", "And…")} /> : <div />}
                     <Button size="icon" variant="ghost" aria-label={t("admin_tools.custom.remove_filter", "Remove filter")} onClick={() => setDefinition(current => ({ ...current, filters: current.filters.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                );
              })}
               {!definition.filters.length && <p className="text-sm text-muted-foreground">{t("admin_tools.custom.no_filters", "No filters. The report will include all accessible rows.")}</p>}
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            <div className="rounded-lg border p-3">
               <div className="mb-3 flex items-center justify-between"><Label>{t("admin_tools.custom.aggregations", "Aggregations")}</Label><Button size="sm" variant="outline" onClick={addAggregation}><Plus className="mr-1 h-3.5 w-3.5" />{t("common.add", "Add")}</Button></div>
              <div className="space-y-2">
                {definition.aggregations.map((aggregation, index) => (
                  <div key={index} className="flex gap-2">
                    <select value={aggregation.function} onChange={event => setDefinition(current => ({ ...current, aggregations: current.aggregations.map((item, itemIndex) => itemIndex === index ? { ...item, function: event.target.value } : item) }))} className="h-9 rounded-md border bg-background px-2 text-sm">
                      {AGGREGATIONS.map(item => <option key={item}>{item}</option>)}
                    </select>
                    <select value={aggregation.field} onChange={event => setDefinition(current => ({ ...current, aggregations: current.aggregations.map((item, itemIndex) => itemIndex === index ? { ...item, field: event.target.value } : item) }))} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
                      <option value="__all__">{t("admin_tools.custom.all_rows", "All rows")}</option>
                   {fields.filter(item => item.aggregatable).map(item => <option key={item.key} value={item.key}>{localize(item.key, item.label)}</option>)}
                    </select>
                     <Button size="icon" variant="ghost" aria-label={t("admin_tools.custom.remove_aggregation", "Remove aggregation")} onClick={() => setDefinition(current => ({ ...current, aggregations: current.aggregations.filter((_, itemIndex) => itemIndex !== index) }))}><Trash2 className="h-4 w-4" /></Button>
                  </div>
                ))}
                 {!definition.aggregations.length && <p className="text-sm text-muted-foreground">{t("admin_tools.custom.no_aggregations", "No aggregations. The preview will show detail rows.")}</p>}
              </div>
            </div>
            <div className="rounded-lg border p-3">
               <Label>{t("admin_tools.custom.sort_results", "Sort results")}</Label>
              <div className="mt-2 flex gap-2">
                <select value={definition.sort?.field ?? ""} onChange={event => setDefinition(current => ({ ...current, sort: event.target.value ? { field: event.target.value, direction: current.sort?.direction ?? "asc" } : undefined }))} className="h-9 min-w-0 flex-1 rounded-md border bg-background px-2 text-sm">
                   <option value="">{t("admin_tools.custom.default_order", "Default order")}</option>
                   {definition.fields.map(key => <option key={key} value={key}>{localize(key, fieldMap.get(key)?.label ?? key)}</option>)}
                   {definition.aggregations.map((aggregation, index) => <option key={`agg_${index}`} value={`agg_${index}`}>{translate("admin_tools.custom.aggregation_result", `${aggregation.function} result ${index + 1}`, { function: aggregation.function, index: index + 1 })}</option>)}
                </select>
                <select value={definition.sort?.direction ?? "asc"} onChange={event => setDefinition(current => current.sort ? { ...current, sort: { ...current.sort, direction: event.target.value as "asc" | "desc" } } : current)} className="h-9 rounded-md border bg-background px-2 text-sm">
                   <option value="asc">{t("admin_tools.custom.ascending", "Ascending")}</option><option value="desc">{t("admin_tools.custom.descending", "Descending")}</option>
                </select>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 border-t pt-4">
             <Input value={reportName} onChange={event => setReportName(event.target.value)} placeholder={t("admin_tools.custom.report_name", "Report name for saving…")} className="max-w-xs" />
             <Button onClick={runPreview} disabled={previewMutation.isPending || !definition.fields.length}><Play className="mr-1.5 h-4 w-4" />{previewMutation.isPending ? t("admin_tools.custom.running", "Running…") : t("admin_tools.custom.preview", "Preview")}</Button>
             <Button variant="outline" onClick={() => reportName.trim() && saveMutation.mutate({ id: loadedReportId || undefined, name: reportName.trim(), definition: buildDefinition() })} disabled={!reportName.trim() || saveMutation.isPending}><Save className="mr-1.5 h-4 w-4" />{t("common.save", "Save")}</Button>
             {loadedReportId && <Button variant="ghost" onClick={() => deleteMutation.mutate(loadedReportId)} disabled={deleteMutation.isPending}><Trash2 className="mr-1.5 h-4 w-4" />{t("common.delete", "Delete")}</Button>}
             <Button variant="outline" onClick={exportCsv} disabled={!definition.fields.length}><Download className="mr-1.5 h-4 w-4" />{t("admin_tools.custom.export_csv", "Export CSV")}</Button>
             <span className="text-xs text-muted-foreground">{t("admin_tools.custom.csv_desc", "CSV opens directly in Excel and preserves the selected report columns.")}</span>
          </div>
        </CardContent>
      </Card>

      {result && (
        <Card>
          <CardHeader className="flex-row items-center justify-between space-y-0">
             <div><CardTitle className="text-base">{t("admin_tools.custom.preview", "Preview")}</CardTitle><CardDescription>{t("admin_tools.custom.accessible_rows", "{{count}} accessible row(s)", { count: result.total })}</CardDescription></div>
             <span className="text-xs text-muted-foreground">{t("admin_tools.custom.page_of", "Page {{page}} of {{total}}", { page: result.page, total: result.totalPages })}</span>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto rounded-md border">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-muted/50"><tr>{result.columns.map(column => <th key={column.key} className="whitespace-nowrap px-3 py-2 text-left font-medium">{localize(column.key, column.label)}</th>)}</tr></thead>
                <tbody>{result.rows.map((row, rowIndex) => <tr key={rowIndex} className="border-t">{result.columns.map(column => <td key={column.key} className="whitespace-nowrap px-3 py-2">{displayValue(row[column.key], column.type, (key, fallback) => translate(key, fallback))}</td>)}</tr>)}</tbody>
              </table>
               {!result.rows.length && <p className="p-6 text-center text-sm text-muted-foreground">{t("admin_tools.custom.no_rows", "No rows matched the current report.")}</p>}
            </div>
            <div className="mt-3 flex items-center justify-between">
               <Button variant="outline" size="sm" disabled={result.page <= 1 || previewMutation.isPending} onClick={() => changePage(result.page - 1)}>{t("common.previous", "Previous")}</Button>
               <Button variant="outline" size="sm" disabled={result.page >= result.totalPages || previewMutation.isPending} onClick={() => changePage(result.page + 1)}>{t("common.next", "Next")}</Button>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}