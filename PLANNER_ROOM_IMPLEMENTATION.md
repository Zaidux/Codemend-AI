# Planner Room Implementation Master Plan

**Created:** December 20, 2025  
**Feature:** AI Planner Room - Expert planning & task delegation system

## 🎯 Feature Overview

A dedicated chat room with an expert planner AI that can:
- Create and manage todo lists
- Read files and create documents
- Delegate tasks to the coding model
- Verify implementations automatically
- Track progress and update task status
- Act as error searcher and debugger

## 📋 Design Decisions (Finalized)

### 1. **Model Selection & Fallback**
- ✅ Use default planner model from settings
- ✅ Fallback to available models if primary is unresponsive
- ✅ Auto-select from user's configured model list

### 2. **Task Delegation & Approval**
- ✅ User must approve delegated tasks (confirmation modal)
- ✅ Show complete plan before execution
- ✅ Allow user to edit/discuss more with planner
- ✅ User controls task deletion

### 3. **Verification Method**
- ✅ **Dual verification:**
  - Regex pattern matching (quick checks)
  - Semantic verification (model reads code and validates)
- ✅ Verify completeness of implementation
- ✅ Check if code matches requirements

### 4. **UI/UX Design**
- ✅ Separate window for planner room
- ✅ Modal for task delegation that redirects to chat
- ✅ View coding model in action in specified/new project
- ✅ Real-time progress tracking

### 5. **Storage & Persistence**
- ✅ Save planner sessions separately from main chat
- ✅ Include knowledge graph for each planner session
- ✅ Link planner session ↔ delegated coding sessions

## 🏗️ Implementation Phases

### **Phase 1: Foundation & Settings** ✅ COMPLETED
**Duration:** ~45 minutes  
**Status:** 🟢 Completed - Dec 20, 2025

**Tasks:**
- [x] Review existing planner config in SettingsModal
- [x] Update planner config for task delegation features
- [x] Add fallback model selector (already exists as activeModelId)
- [x] Update types.ts with planner session types
- [x] Create PlannerSession interface (updated Session type)
- [x] Add DelegatedTask interface
- [x] Add VerificationResult interface
- [x] Add PlannerKnowledge interface
- [x] Updated planner role system prompt with delegation capabilities

**Files Modified:**
- `types.ts` ✅ (Added DelegatedTask, VerificationResult, PlannerKnowledge, updated Session)
- `constants.ts` ✅ (Updated role_architect system prompt)

**Deliverables:**
- ✅ Planner config exists in settings (plannerModelId, plannerRoleId)
- ✅ Session type definitions complete
- ✅ Fallback model logic (using existing activeModelId)
- ✅ Enhanced planner role with delegation instructions

---

### **Phase 2: Planner Room UI** ✅ COMPLETED
**Duration:** ~1 hour  
**Status:** 🟢 Completed - Dec 20, 2025

**Tasks:**
- [x] Create PlannerRoom.tsx component
- [x] Design planner chat interface (separate window/modal)
- [x] Implement session management for planner
- [x] Create planner system prompt (updated in constants.ts)
- [x] Add active tasks panel (right sidebar)
- [x] Add progress tracking UI
- [x] Style planner room with purple/pink gradient theme
- [x] Add empty states for chat and tasks
- [x] Add task status icons and colors
- [x] Add priority indicators

**Files Created:**
- `components/PlannerRoom.tsx` ✅ (340 lines, full UI implementation)

**Deliverables:**
- ✅ Functional planner chat interface
- ✅ Split layout: Chat + Task Panel
- ✅ Task status visualization
- ✅ Beautiful gradient theme
- ✅ Responsive design

**Next Steps:**
- Need to integrate into App.tsx
- Need to add planner button to header
- Need to implement planner-specific message handling

---

### **Phase 3: Planner-Specific Tools** ⏳ Not Started
**Duration:** ~1.5 hours  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Add `create_todo` tool
- [ ] Add `update_todo_status` tool
- [ ] Add `create_document` tool (markdown files)
- [ ] Add `verify_implementation` tool (regex + semantic)
- [ ] Add `read_implementation` tool (specialized code reading)
- [ ] Add `search_errors` tool (error detection)
- [ ] Update llmTools.ts with planner-only flag
- [ ] Update llmService.ts to handle planner tools
- [ ] Implement tool execution for planner context

**Files to Modify:**
- `services/llmTools.ts`
- `services/llmService.ts`

**New Tool Definitions:**
```typescript
// create_todo
{
  name: 'create_todo',
  plannerOnly: true,
  parameters: { title, description, priority, estimatedTime }
}

// update_todo_status
{
  name: 'update_todo_status',
  plannerOnly: true,
  parameters: { todoId, status, notes }
}

// create_document
{
  name: 'create_document',
  plannerOnly: true,
  parameters: { path, content, type }
}

// verify_implementation
{
  name: 'verify_implementation',
  plannerOnly: true,
  parameters: { filePath, requirements, verificationLevel }
}
```

**Deliverables:**
- ✅ Planner can create/manage todos
- ✅ Planner can create documentation
- ✅ Planner can verify code

---

### **Phase 4: Task Delegation System** ⏳ Not Started
**Duration:** ~2 hours  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Create DelegationService.ts
- [ ] Add `delegate_task` tool for planner
- [ ] Create task approval modal
- [ ] Implement plan review UI
- [ ] Add edit/discuss functionality
- [ ] Create delegated task queue
- [ ] Link planner session to coding session
- [ ] Auto-create coding session from delegation
- [ ] Add redirect to coding chat
- [ ] Implement task handoff protocol

**Files to Create:**
- `services/delegationService.ts`
- `components/TaskApprovalModal.tsx`
- `components/DelegatedTaskQueue.tsx`

**Files to Modify:**
- `services/llmTools.ts` (add delegate_task)
- `App.tsx` (delegation state management)

**Task Delegation Flow:**
```
1. Planner creates plan with delegate_task tool
2. Show TaskApprovalModal with:
   - Complete task breakdown
   - Estimated time
   - Files to be created/modified
   - [Approve] [Edit Plan] [Cancel]
3. On Approve:
   - Create new session (or use existing project)
   - Add task to coding model's context
   - Redirect user to coding chat
   - Start tracking progress
4. On Edit Plan:
   - Return to planner chat
   - Include user feedback
```

**Deliverables:**
- ✅ Task delegation tool
- ✅ User approval system
- ✅ Session creation & linking
- ✅ Redirect to coding chat

---

### **Phase 5: Progress Tracking & Verification** ⏳ Not Started
**Duration:** ~1.5 hours  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Create ProgressTracker.tsx component
- [ ] Monitor coding AI responses
- [ ] Parse completion signals from AI
- [ ] Implement auto-verification triggers
- [ ] Add regex verification logic
- [ ] Add semantic verification (AI reads & validates)
- [ ] Update todo status automatically
- [ ] Create verification reports
- [ ] Add planner notifications
- [ ] Handle verification failures
- [ ] Force coding model to re-check on failure

**Files to Create:**
- `components/ProgressTracker.tsx`
- `services/verificationService.ts`

**Files to Modify:**
- `services/llmService.ts` (intercept coding AI responses)
- `components/PlannerRoom.tsx` (show progress updates)

**Verification Logic:**
```typescript
interface VerificationResult {
  passed: boolean;
  method: 'regex' | 'semantic';
  completeness: number; // 0-100%
  issues: string[];
  recommendations: string[];
}

// Dual verification:
1. Regex Check: Quick pattern matching
   - Function exists
   - Imports present
   - Basic structure correct

2. Semantic Check: AI reads code
   - Understands implementation
   - Matches requirements
   - Checks edge cases
   - Validates completeness
```

**Deliverables:**
- ✅ Real-time progress tracking
- ✅ Auto-verification system
- ✅ Todo status updates
- ✅ Error detection & reporting

---

### **Phase 6: Knowledge Graph & Storage** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Create separate storage for planner sessions
- [ ] Implement planner knowledge graph
- [ ] Link planner ↔ coding sessions
- [ ] Add session metadata
- [ ] Create planner session history
- [ ] Add session search/filter
- [ ] Implement session export
- [ ] Add session templates

**Storage Keys:**
```
- cm_planner_sessions
- cm_planner_knowledge_graph
- cm_delegated_tasks
- cm_verification_history
```

**Files to Modify:**
- `App.tsx` (storage logic)
- `services/contextService.ts` (planner context)

**Deliverables:**
- ✅ Persistent planner sessions
- ✅ Knowledge graph integration
- ✅ Session linking

---

### **Phase 7: Error Detection & Recovery** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Add error detection from AI logs
- [ ] Create error analysis tool
- [ ] Implement auto-retry logic
- [ ] Add error reports for planner
- [ ] Create debugging suggestions
- [ ] Add manual intervention options
- [ ] Implement rollback on critical failures

**Files to Create:**
- `services/errorDetectionService.ts`

**Deliverables:**
- ✅ Automatic error detection
- ✅ Error reporting to planner
- ✅ Recovery mechanisms

---

### **Phase 8: Polish & Testing** ⏳ Not Started
**Duration:** ~1 hour  
**Status:** 🔴 Not Started

**Tasks:**
- [ ] Add keyboard shortcuts
- [ ] Improve animations/transitions
- [ ] Add loading states
- [ ] Create user documentation
- [ ] Add tooltips/help text
- [ ] Test all verification scenarios
- [ ] Test delegation flow
- [ ] Test error recovery
- [ ] Performance optimization
- [ ] Bug fixes

**Deliverables:**
- ✅ Polished UI/UX
- ✅ Complete documentation
- ✅ Tested & stable

---

## 📊 Overall Progress

**Total Phases:** 8  
**Completed:** 2 ✅  
**In Progress:** 0  
**Not Started:** 6  
**Overall:** 25% Complete

**Estimated Total Time:** ~9.5 hours  
**Time Spent:** ~1.5 hours  
**Time Remaining:** ~8 hours

---

## 🔗 Key Integration Points

### Existing Systems to Connect:
1. **Model Switch Service** - Use for fallback models
2. **Todo List** - Already integrated, extend for planner
3. **LLM Tools** - Add planner-only tools
4. **Session Management** - Create planner session type
5. **Context Service** - Add planner context handling
6. **Knowledge Base** - Create planner knowledge graph

### New Services to Create:
1. **DelegationService** - Handle task delegation
2. **VerificationService** - Code verification logic
3. **ErrorDetectionService** - Error analysis
4. **PlannerLLMService** - Specialized planner AI handling

---

## 📝 Notes & Considerations

### Technical Decisions:
- Use existing tool infrastructure (llmTools.ts)
- Extend session types instead of creating new system
- Reuse TodoList component with enhanced features
- Leverage existing file reading tools
- Build on top of current LLM service

### User Experience:
- Clear visual separation (planner vs coding)
- Confirmation required for all delegations
- Real-time progress visibility
- Easy to return to planner from coding chat
- Transparent verification process

### Future Enhancements:
- Multi-project planning
- Planner templates (common patterns)
- Team collaboration features
- Cost tracking for delegated tasks
- Performance analytics

---

## 🚀 Next Steps

1. **Review existing planner config** in SettingsModal
2. **Start Phase 1** - Foundation & Settings
3. **Iterate phase by phase** as approved
4. **Track progress** in this document

---

**Last Updated:** December 20, 2025  
**Current Phase:** Phase 2 Complete - Ready for Phase 3 (Planner Tools)

---

## 📦 Completed Work Summary

### Phase 1 - Foundation ✅
- Updated Session interface with planner support
- Created DelegatedTask, VerificationResult, PlannerKnowledge types
- Enhanced planner role system prompt
- Verified existing planner config in settings

### Phase 2 - Planner Room UI ✅
- Created full PlannerRoom component (340 lines)
- Split layout: Chat area + Task panel
- Task status visualization with icons/colors
- Priority indicators
- Empty states
- Purple/pink gradient theme
- Responsive design

### Integration Complete ✅
- **App.tsx Integration:**
  - Added planner sessions state with localStorage persistence
  - Added delegated tasks state with localStorage persistence
  - Added planner knowledge state with localStorage persistence
  - Created handlePlannerMessage() for planner AI responses
  - Created updatePlannerSession() for session management
  - Created generatePlannerSessionTitle() for auto-titles
  - Created handleDelegateTask() for task delegation
  - Integrated PlannerRoom component in render tree
  
- **Header.tsx Integration:**
  - Added Brain icon button for Planner Room
  - Purple hover effect to distinguish from other buttons
  - Tooltip: "Planner Room - Expert Planning & Task Delegation"
  
- **Storage Keys Added:**
  - `cm_planner_sessions` - Planner chat sessions
  - `cm_delegated_tasks` - Tasks delegated to coder
  - `cm_planner_knowledge` - Planner knowledge graph

- **Build Status:** ✅ Successful (50.16s, 887.65 KB main bundle)

### Ready for Phase 3
- Planner Room fully functional UI
- Session management working
- Storage persistence active
- Ready to add planner-specific tools

