{{/* Chart name, overridable. */}}
{{- define "stockpile.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" -}}
{{- end -}}

{{/* Base name for every resource: "<release>" if it already contains the chart name, else "<release>-stockpile". */}}
{{- define "stockpile.fullname" -}}
{{- if .Values.fullnameOverride -}}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- $name := default .Chart.Name .Values.nameOverride -}}
{{- if contains $name .Release.Name -}}
{{- .Release.Name | trunc 63 | trimSuffix "-" -}}
{{- else -}}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" -}}
{{- end -}}
{{- end -}}
{{- end -}}

{{- define "stockpile.labels" -}}
helm.sh/chart: {{ printf "%s-%s" .Chart.Name .Chart.Version }}
app.kubernetes.io/name: {{ include "stockpile.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
app.kubernetes.io/part-of: stockpile
{{- end -}}

{{/* Usage: include "stockpile.selectorLabels" (dict "ctx" . "component" "backend") */}}
{{- define "stockpile.selectorLabels" -}}
app.kubernetes.io/name: {{ include "stockpile.name" .ctx }}
app.kubernetes.io/instance: {{ .ctx.Release.Name }}
app.kubernetes.io/component: {{ .component }}
{{- end -}}

{{- define "stockpile.backendName" -}}{{ include "stockpile.fullname" . }}-backend{{- end -}}
{{- define "stockpile.frontendName" -}}{{ include "stockpile.fullname" . }}-frontend{{- end -}}
{{- define "stockpile.postgresName" -}}{{ include "stockpile.fullname" . }}-postgres{{- end -}}
