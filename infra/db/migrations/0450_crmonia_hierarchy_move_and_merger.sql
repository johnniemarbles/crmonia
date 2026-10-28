-- ============================================================================
-- MIGRATION: 0450_crmonia_hierarchy_move_and_merger.sql
-- PURPOSE: Atomic Subtree Re-parenting, Merger Engine & Cascading ltree Rewriter
-- ARCHITECTURE: CRMONIA (PII + EXPADIO Enterprise Base)
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1. DRY-RUN PREVIEW FUNCTION FOR SUBTREE MOVES
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.preview_move_org_node_subtree(
  p_node_id UUID,
  p_new_parent_id UUID
) RETURNS JSONB AS $$
DECLARE
  v_node platform.org_nodes%ROWTYPE;
  v_new_parent platform.org_nodes%ROWTYPE;
  v_node_sub_name TEXT;
  v_new_path ltree;
  v_descendant_count INT;
  v_affected_leads_count INT;
  v_affected_playbooks_count INT;
  v_residency_cross_border BOOLEAN;
BEGIN
  -- 1. Validate Target Node
  SELECT * INTO v_node FROM platform.org_nodes WHERE id = p_node_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source node % not found.', p_node_id;
  END IF;

  IF v_node.parent_id IS NULL THEN
    RAISE EXCEPTION 'Cannot re-parent the root organization node.';
  END IF;

  -- 2. Validate New Parent
  SELECT * INTO v_new_parent FROM platform.org_nodes WHERE id = p_new_parent_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target parent node % not found.', p_new_parent_id;
  END IF;

  -- 3. Cycle Detection: new parent must NOT be a descendant of node
  IF v_new_parent.org_path <@ v_node.org_path THEN
    RAISE EXCEPTION 'Cycle Detected: Target parent node % is a descendant of source node %.',
      v_new_parent.org_path, v_node.org_path;
  END IF;

  -- 4. Calculate proposed new path
  v_node_sub_name := subpath(v_node.org_path, nlevel(v_node.org_path) - 1, 1)::text;
  v_new_path := v_new_parent.org_path || text2ltree(v_node_sub_name);

  -- 5. Calculate Impact Counts
  SELECT COUNT(*) INTO v_descendant_count
  FROM platform.org_nodes
  WHERE org_path <@ v_node.org_path AND id != v_node.id;

  SELECT COUNT(*) INTO v_affected_leads_count
  FROM platform.crm_leads
  WHERE org_path <@ v_node.org_path;

  SELECT COUNT(*) INTO v_affected_playbooks_count
  FROM gtm.playbooks
  WHERE owner_org_path <@ v_node.org_path;

  v_residency_cross_border := (v_node.country_code != v_new_parent.country_code);

  RETURN jsonb_build_object(
    'sourceNodeId', v_node.id,
    'sourceNodeName', v_node.name,
    'sourceTier', v_node.tier,
    'oldPath', v_node.org_path::text,
    'targetParentId', v_new_parent.id,
    'targetParentName', v_new_parent.name,
    'targetParentTier', v_new_parent.tier,
    'targetParentPath', v_new_parent.org_path::text,
    'proposedNewPath', v_new_path::text,
    'descendantNodesCount', v_descendant_count,
    'affectedLeadsCount', v_affected_leads_count,
    'affectedPlaybooksCount', v_affected_playbooks_count,
    'isCrossBorderMove', v_residency_cross_border,
    'sourceCountry', v_node.country_code,
    'targetCountry', v_new_parent.country_code
  );
END;
$$ LANGUAGE plpgsql STABLE;

-- ----------------------------------------------------------------------------
-- 2. TRANSACTIONAL ATOMIC SUBTREE RE-PARENTING ENGINE
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION platform.move_org_node_subtree(
  p_node_id UUID,
  p_new_parent_id UUID,
  p_actor_user_id UUID,
  p_allow_cross_border BOOLEAN DEFAULT false
) RETURNS JSONB AS $$
DECLARE
  v_node platform.org_nodes%ROWTYPE;
  v_new_parent platform.org_nodes%ROWTYPE;
  v_old_path ltree;
  v_new_path ltree;
  v_old_level INT;
  v_node_sub_name TEXT;
  v_affected_nodes INT;
  v_affected_leads INT;
  v_affected_playbooks INT;
BEGIN
  -- 1. Fetch & Lock Source Node and New Parent
  SELECT * INTO v_node FROM platform.org_nodes WHERE id = p_node_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Source node % not found.', p_node_id;
  END IF;

  IF v_node.parent_id IS NULL THEN
    RAISE EXCEPTION 'Cannot re-parent the root organization node.';
  END IF;

  SELECT * INTO v_new_parent FROM platform.org_nodes WHERE id = p_new_parent_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Target parent node % not found.', p_new_parent_id;
  END IF;

  -- 2. Cycle Detection
  IF v_new_parent.org_path <@ v_node.org_path THEN
    RAISE EXCEPTION 'Cycle Detected: Cannot move node % under its own descendant %.',
      v_node.org_path, v_new_parent.org_path;
  END IF;

  -- 3. Strict Residency Fencing Guard
  IF (v_node.country_code != v_new_parent.country_code) AND NOT p_allow_cross_border THEN
    RAISE EXCEPTION 'Residency Violation: Moving from % to % requires explicit cross-border compliance approval.',
      v_node.country_code, v_new_parent.country_code;
  END IF;

  -- 4. Calculate Paths
  v_old_path := v_node.org_path;
  v_old_level := nlevel(v_old_path);
  v_node_sub_name := subpath(v_old_path, v_old_level - 1, 1)::text;
  v_new_path := v_new_parent.org_path || text2ltree(v_node_sub_name);

  -- 5. Update Source Node Parent Pointer
  UPDATE platform.org_nodes
  SET parent_id = p_new_parent_id,
      updated_at = now()
  WHERE id = p_node_id;

  -- 6. Rewrite org_path for Source Node and All Descendants
  UPDATE platform.org_nodes
  SET org_path = v_new_path || subpath(org_path, v_old_level),
      country_code = v_new_parent.country_code,
      updated_at = now()
  WHERE org_path <@ v_old_path;
  GET DIAGNOSTICS v_affected_nodes = ROW_COUNT;

  -- 7. Cascade Path Rewrite to platform.crm_leads
  UPDATE platform.crm_leads
  SET org_path = v_new_path || subpath(org_path, v_old_level),
      country_code = v_new_parent.country_code,
      updated_at = now()
  WHERE org_path <@ v_old_path;
  GET DIAGNOSTICS v_affected_leads = ROW_COUNT;

  -- 8. Cascade Path Rewrite to gtm.playbooks
  UPDATE gtm.playbooks
  SET owner_org_path = v_new_path || subpath(owner_org_path, v_old_level),
      updated_at = now()
  WHERE owner_org_path <@ v_old_path;
  GET DIAGNOSTICS v_affected_playbooks = ROW_COUNT;

  -- 9. Cascade Path Rewrite to gtm.prospect_observations
  UPDATE gtm.prospect_observations
  SET org_path = v_new_path || subpath(org_path, v_old_level),
      country_code = v_new_parent.country_code,
      updated_at = now()
  WHERE org_path <@ v_old_path;

  -- 10. Cascade Path Rewrite to platform.governance_policies
  UPDATE platform.governance_policies
  SET org_path = v_new_path || subpath(org_path, v_old_level),
      updated_at = now()
  WHERE org_path <@ v_old_path;

  -- 11. Cascade Path Rewrite to gtm.playbook_step_variants
  UPDATE gtm.playbook_step_variants
  SET org_path = v_new_path || subpath(org_path, v_old_level)
  WHERE org_path <@ v_old_path;

  RETURN jsonb_build_object(
    'status', 'SUBTREE_MOVED_SUCCESSFULLY',
    'nodeId', p_node_id,
    'oldPath', v_old_path::text,
    'newPath', v_new_path::text,
    'affectedNodesCount', v_affected_nodes,
    'affectedLeadsCount', v_affected_leads,
    'affectedPlaybooksCount', v_affected_playbooks,
    'movedByUserId', p_actor_user_id,
    'movedAt', now()
  );
END;
$$ LANGUAGE plpgsql;

COMMIT;
