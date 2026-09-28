<script setup lang="ts">
import type { NonGrainWorkspaceContext } from '@/mocks/non-grain-workspace'

defineProps<{ context: NonGrainWorkspaceContext }>()
</script>

<template>
  <section class="ng-summary">
    <article class="ng-summary-card">
      <small>????</small>
      <b>??????????????????</b>
    </article>
    <article class="ng-summary-card">
      <small>????</small>
      <b>{{ context.task.createdAt }}</b>
    </article>
    <article class="ng-summary-card">
      <small>????</small>
      <b>{{ context.task.area }}</b>
    </article>
    <article class="ng-summary-card">
      <small>??????</small>
      <b>{{ context.summary.plotCount }} ?</b>
    </article>
    <article class="ng-summary-card">
      <small>?????</small>
      <b>{{ context.summary.totalArea }} ?</b>
    </article>
    <article class="ng-summary-card">
      <small>?????</small>
      <b>?</b>
    </article>
    <article class="ng-summary-card">
      <small>??????</small>
      <b class="ng-kpi-emphasis">???? 6.31 ?</b>
    </article>
  </section>
</template>
