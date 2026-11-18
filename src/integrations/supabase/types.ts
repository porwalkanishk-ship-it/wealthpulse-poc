export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[]

export type Database = {
  // Allows to automatically instantiate createClient with right options
  // instead of createClient<Database, { PostgrestVersion: 'XX' }>(URL, KEY)
  __InternalSupabase: {
    PostgrestVersion: "14.18"
  }
  public: {
    Tables: {
      cas_ai_calls: {
        Row: {
          created_at: string
          id: string
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          user_id?: string
        }
        Relationships: []
      }
      cas_imports: {
        Row: {
          funds_count: number
          id: string
          imported_at: string
          profile_id: string
          reminder_sent_at: string | null
          source: string
          statement_from: string | null
          statement_to: string
          user_id: string
        }
        Insert: {
          funds_count?: number
          id?: string
          imported_at?: string
          profile_id: string
          reminder_sent_at?: string | null
          source?: string
          statement_from?: string | null
          statement_to: string
          user_id?: string
        }
        Update: {
          funds_count?: number
          id?: string
          imported_at?: string
          profile_id?: string
          reminder_sent_at?: string | null
          source?: string
          statement_from?: string | null
          statement_to?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "cas_imports_profile_id_fkey"
            columns: ["profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      equity_holdings: {
        Row: {
          avg_buy_price: number | null
          created_at: string
          currency: string
          id: string
          is_hidden: boolean
          owner_profile_id: string
          quantity: number
          security_id: string
          updated_at: string
          user_id: string
        }
        Insert: {
          avg_buy_price?: number | null
          created_at?: string
          currency: string
          id?: string
          is_hidden?: boolean
          owner_profile_id: string
          quantity: number
          security_id: string
          updated_at?: string
          user_id?: string
        }
        Update: {
          avg_buy_price?: number | null
          created_at?: string
          currency?: string
          id?: string
          is_hidden?: boolean
          owner_profile_id?: string
          quantity?: number
          security_id?: string
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "equity_holdings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "equity_holdings_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
      }
      holdings: {
        Row: {
          amount: number
          as_of: string
          cas_verified_at: string | null
          category: string
          compounding_frequency: string | null
          created_at: string
          folio: string | null
          id: string
          interest_type: string
          is_hidden: boolean
          isin: string | null
          linked_loan_id: string | null
          maturity_date: string | null
          member_id: string | null
          monthly_contribution: number
          name: string
          nav: number | null
          nav_date: string | null
          next_due: string | null
          owner_profile_id: string | null
          premium: number | null
          prev_nav: number | null
          price_currency: string
          quantity: number | null
          rate: number | null
          scheme_code: string | null
          sip_active: boolean
          sip_amount: number | null
          sip_day: number | null
          sip_start: string | null
          start_date: string | null
          statement_date: string | null
          statement_nav: number | null
          statement_value: number | null
          subtitle: string | null
          unit_price: number | null
          units: number | null
          unvested_quantity: number | null
          updated_at: string
          user_id: string
        }
        Insert: {
          amount?: number
          as_of?: string
          cas_verified_at?: string | null
          category: string
          compounding_frequency?: string | null
          created_at?: string
          folio?: string | null
          id?: string
          interest_type?: string
          is_hidden?: boolean
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id?: string | null
          monthly_contribution?: number
          name: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          owner_profile_id?: string | null
          premium?: number | null
          prev_nav?: number | null
          price_currency?: string
          quantity?: number | null
          rate?: number | null
          scheme_code?: string | null
          sip_active?: boolean
          sip_amount?: number | null
          sip_day?: number | null
          sip_start?: string | null
          start_date?: string | null
          statement_date?: string | null
          statement_nav?: number | null
          statement_value?: number | null
          subtitle?: string | null
          unit_price?: number | null
          units?: number | null
          unvested_quantity?: number | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          amount?: number
          as_of?: string
          cas_verified_at?: string | null
          category?: string
          compounding_frequency?: string | null
          created_at?: string
          folio?: string | null
          id?: string
          interest_type?: string
          is_hidden?: boolean
          isin?: string | null
          linked_loan_id?: string | null
          maturity_date?: string | null
          member_id?: string | null
          monthly_contribution?: number
          name?: string
          nav?: number | null
          nav_date?: string | null
          next_due?: string | null
          owner_profile_id?: string | null
          premium?: number | null
          prev_nav?: number | null
          price_currency?: string
          quantity?: number | null
          rate?: number | null
          scheme_code?: string | null
          sip_active?: boolean
          sip_amount?: number | null
          sip_day?: number | null
          sip_start?: string | null
          start_date?: string | null
          statement_date?: string | null
          statement_nav?: number | null
          statement_value?: number | null
          subtitle?: string | null
          unit_price?: number | null
          units?: number | null
          unvested_quantity?: number | null
          updated_at?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "holdings_linked_loan_id_fkey"
            columns: ["linked_loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "holdings_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      household_members: {
        Row: {
          household_id: string
          joined_at: string
          role: string
          user_id: string
        }
        Insert: {
          household_id: string
          joined_at?: string
          role?: string
          user_id: string
        }
        Update: {
          household_id?: string
          joined_at?: string
          role?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "household_members_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      households: {
        Row: {
          created_at: string
          display_currency: string
          id: string
          invite_code: string
          name: string
        }
        Insert: {
          created_at?: string
          display_currency?: string
          id?: string
          invite_code?: string
          name: string
        }
        Update: {
          created_at?: string
          display_currency?: string
          id?: string
          invite_code?: string
          name?: string
        }
        Relationships: []
      }
      join_requests: {
        Row: {
          claim_completed_at: string | null
          claim_profile_id: string | null
          consent_at: string
          created_at: string
          creator_decision: string | null
          decided_at: string | null
          household_id: string
          household_name: string
          id: string
          leader_decision: string | null
          requester_name: string
          requester_user_id: string
          status: string
        }
        Insert: {
          claim_completed_at?: string | null
          claim_profile_id?: string | null
          consent_at?: string
          created_at?: string
          creator_decision?: string | null
          decided_at?: string | null
          household_id: string
          household_name: string
          id?: string
          leader_decision?: string | null
          requester_name: string
          requester_user_id: string
          status?: string
        }
        Update: {
          claim_completed_at?: string | null
          claim_profile_id?: string | null
          consent_at?: string
          created_at?: string
          creator_decision?: string | null
          decided_at?: string | null
          household_id?: string
          household_name?: string
          id?: string
          leader_decision?: string | null
          requester_name?: string
          requester_user_id?: string
          status?: string
        }
        Relationships: [
          {
            foreignKeyName: "join_requests_claim_profile_id_fkey"
            columns: ["claim_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "join_requests_household_id_fkey"
            columns: ["household_id"]
            isOneToOne: false
            referencedRelation: "households"
            referencedColumns: ["id"]
          },
        ]
      }
      loan_events: {
        Row: {
          amount: number
          created_at: string
          event_date: string
          id: string
          is_hidden: boolean
          kind: string
          loan_id: string
          note: string | null
          owner_profile_id: string | null
          user_id: string
        }
        Insert: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          is_hidden?: boolean
          kind?: string
          loan_id: string
          note?: string | null
          owner_profile_id?: string | null
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          event_date?: string
          id?: string
          is_hidden?: boolean
          kind?: string
          loan_id?: string
          note?: string | null
          owner_profile_id?: string | null
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loan_events_loan_id_fkey"
            columns: ["loan_id"]
            isOneToOne: false
            referencedRelation: "loans"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "loan_events_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      loans: {
        Row: {
          account_ref: string | null
          as_of: string
          created_at: string
          emi: number
          emi_day: number
          id: string
          is_hidden: boolean
          kind: string
          member_id: string | null
          name: string
          original_principal: number
          outstanding: number
          owner_profile_id: string | null
          rate: number
          rate_type: string
          user_id: string
        }
        Insert: {
          account_ref?: string | null
          as_of?: string
          created_at?: string
          emi?: number
          emi_day?: number
          id?: string
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name: string
          original_principal?: number
          outstanding?: number
          owner_profile_id?: string | null
          rate?: number
          rate_type?: string
          user_id?: string
        }
        Update: {
          account_ref?: string | null
          as_of?: string
          created_at?: string
          emi?: number
          emi_day?: number
          id?: string
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name?: string
          original_principal?: number
          outstanding?: number
          owner_profile_id?: string | null
          rate?: number
          rate_type?: string
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "loans_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      members: {
        Row: {
          created_at: string
          id: string
          name: string
          sort: number
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          name: string
          sort?: number
          user_id?: string
        }
        Update: {
          created_at?: string
          id?: string
          name?: string
          sort?: number
          user_id?: string
        }
        Relationships: []
      }
      mf_transactions: {
        Row: {
          amount: number
          balance_units: number | null
          created_at: string
          holding_id: string
          id: string
          is_hidden: boolean
          nav: number | null
          owner_profile_id: string | null
          txn_date: string
          type: string
          units: number
          user_id: string
        }
        Insert: {
          amount?: number
          balance_units?: number | null
          created_at?: string
          holding_id: string
          id?: string
          is_hidden?: boolean
          nav?: number | null
          owner_profile_id?: string | null
          txn_date: string
          type: string
          units?: number
          user_id?: string
        }
        Update: {
          amount?: number
          balance_units?: number | null
          created_at?: string
          holding_id?: string
          id?: string
          is_hidden?: boolean
          nav?: number | null
          owner_profile_id?: string | null
          txn_date?: string
          type?: string
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "mf_transactions_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "mf_transactions_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      notifications: {
        Row: {
          body: string | null
          created_at: string
          dedupe_key: string | null
          id: string
          link: string | null
          read_at: string | null
          title: string
          type: string
          user_id: string
        }
        Insert: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title: string
          type: string
          user_id: string
        }
        Update: {
          body?: string | null
          created_at?: string
          dedupe_key?: string | null
          id?: string
          link?: string | null
          read_at?: string | null
          title?: string
          type?: string
          user_id?: string
        }
        Relationships: []
      }
      policies: {
        Row: {
          cover: number
          created_at: string
          frequency: string
          id: string
          insurer: string | null
          is_hidden: boolean
          kind: string
          member_id: string | null
          name: string
          next_due: string
          owner_profile_id: string | null
          policy_number: string | null
          premium: number
          user_id: string
        }
        Insert: {
          cover?: number
          created_at?: string
          frequency?: string
          id?: string
          insurer?: string | null
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name: string
          next_due?: string
          owner_profile_id?: string | null
          policy_number?: string | null
          premium?: number
          user_id?: string
        }
        Update: {
          cover?: number
          created_at?: string
          frequency?: string
          id?: string
          insurer?: string | null
          is_hidden?: boolean
          kind?: string
          member_id?: string | null
          name?: string
          next_due?: string
          owner_profile_id?: string | null
          policy_number?: string | null
          premium?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "policies_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      profiles: {
        Row: {
          base_currency: string
          country: string | null
          created_at: string
          display_name: string
          hide_everything: boolean
          id: string
          managed_by_user_id: string | null
          owner_user_id: string | null
          relationship: string
        }
        Insert: {
          base_currency?: string
          country?: string | null
          created_at?: string
          display_name: string
          hide_everything?: boolean
          id?: string
          managed_by_user_id?: string | null
          owner_user_id?: string | null
          relationship?: string
        }
        Update: {
          base_currency?: string
          country?: string | null
          created_at?: string
          display_name?: string
          hide_everything?: boolean
          id?: string
          managed_by_user_id?: string | null
          owner_user_id?: string | null
          relationship?: string
        }
        Relationships: []
      }
      receivable_repayments: {
        Row: {
          amount: number
          created_at: string
          holding_id: string
          id: string
          note: string | null
          repayment_date: string
        }
        Insert: {
          amount: number
          created_at?: string
          holding_id: string
          id?: string
          note?: string | null
          repayment_date: string
        }
        Update: {
          amount?: number
          created_at?: string
          holding_id?: string
          id?: string
          note?: string | null
          repayment_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "receivable_repayments_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
        ]
      }
      rsu_grants: {
        Row: {
          company_name: string
          created_at: string
          grant_date: string
          id: string
          is_hidden: boolean
          last_listing_check_at: string | null
          listed: boolean
          listing_snoozed_until: string | null
          manual_price: number | null
          manual_price_currency: string | null
          manual_price_date: string | null
          owner_profile_id: string
          preset_config: Json
          security_id: string | null
          total_shares: number
          updated_at: string
          user_id: string
          vesting_type: string
          withholding_pct: number
        }
        Insert: {
          company_name: string
          created_at?: string
          grant_date: string
          id?: string
          is_hidden?: boolean
          last_listing_check_at?: string | null
          listed?: boolean
          listing_snoozed_until?: string | null
          manual_price?: number | null
          manual_price_currency?: string | null
          manual_price_date?: string | null
          owner_profile_id: string
          preset_config?: Json
          security_id?: string | null
          total_shares: number
          updated_at?: string
          user_id?: string
          vesting_type: string
          withholding_pct?: number
        }
        Update: {
          company_name?: string
          created_at?: string
          grant_date?: string
          id?: string
          is_hidden?: boolean
          last_listing_check_at?: string | null
          listed?: boolean
          listing_snoozed_until?: string | null
          manual_price?: number | null
          manual_price_currency?: string | null
          manual_price_date?: string | null
          owner_profile_id?: string
          preset_config?: Json
          security_id?: string | null
          total_shares?: number
          updated_at?: string
          user_id?: string
          vesting_type?: string
          withholding_pct?: number
        }
        Relationships: [
          {
            foreignKeyName: "rsu_grants_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "rsu_grants_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
      }
      rsu_vests: {
        Row: {
          created_at: string
          delivered_shares: number | null
          grant_id: string
          id: string
          notified_at: string | null
          price_currency: string | null
          price_on_vest: number | null
          shares: number
          status: string
          vest_date: string
        }
        Insert: {
          created_at?: string
          delivered_shares?: number | null
          grant_id: string
          id?: string
          notified_at?: string | null
          price_currency?: string | null
          price_on_vest?: number | null
          shares: number
          status?: string
          vest_date: string
        }
        Update: {
          created_at?: string
          delivered_shares?: number | null
          grant_id?: string
          id?: string
          notified_at?: string | null
          price_currency?: string | null
          price_on_vest?: number | null
          shares?: number
          status?: string
          vest_date?: string
        }
        Relationships: [
          {
            foreignKeyName: "rsu_vests_grant_id_fkey"
            columns: ["grant_id"]
            isOneToOne: false
            referencedRelation: "rsu_grants"
            referencedColumns: ["id"]
          },
        ]
      }
      securities: {
        Row: {
          active: boolean
          country: string
          currency: string
          exchange: string
          id: string
          isin: string | null
          name: string
          symbol: string
          type: string
          updated_at: string
        }
        Insert: {
          active?: boolean
          country: string
          currency: string
          exchange: string
          id?: string
          isin?: string | null
          name: string
          symbol: string
          type?: string
          updated_at?: string
        }
        Update: {
          active?: boolean
          country?: string
          currency?: string
          exchange?: string
          id?: string
          isin?: string | null
          name?: string
          symbol?: string
          type?: string
          updated_at?: string
        }
        Relationships: []
      }
      security_prices: {
        Row: {
          close: number
          currency: string
          fetched_at: string
          prev_close: number | null
          price_date: string
          security_id: string
          source: string
        }
        Insert: {
          close: number
          currency: string
          fetched_at?: string
          prev_close?: number | null
          price_date: string
          security_id: string
          source: string
        }
        Update: {
          close?: number
          currency?: string
          fetched_at?: string
          prev_close?: number | null
          price_date?: string
          security_id?: string
          source?: string
        }
        Relationships: [
          {
            foreignKeyName: "security_prices_security_id_fkey"
            columns: ["security_id"]
            isOneToOne: false
            referencedRelation: "securities"
            referencedColumns: ["id"]
          },
        ]
      }
      sip_installments: {
        Row: {
          amount: number
          created_at: string
          due_date: string
          holding_id: string
          id: string
          is_hidden: boolean
          nav: number | null
          nav_date: string | null
          owner_profile_id: string | null
          status: string
          units: number
          user_id: string
        }
        Insert: {
          amount: number
          created_at?: string
          due_date: string
          holding_id: string
          id?: string
          is_hidden?: boolean
          nav?: number | null
          nav_date?: string | null
          owner_profile_id?: string | null
          status?: string
          units?: number
          user_id?: string
        }
        Update: {
          amount?: number
          created_at?: string
          due_date?: string
          holding_id?: string
          id?: string
          is_hidden?: boolean
          nav?: number | null
          nav_date?: string | null
          owner_profile_id?: string | null
          status?: string
          units?: number
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "sip_installments_holding_id_fkey"
            columns: ["holding_id"]
            isOneToOne: false
            referencedRelation: "holdings"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "sip_installments_owner_profile_id_fkey"
            columns: ["owner_profile_id"]
            isOneToOne: false
            referencedRelation: "profiles"
            referencedColumns: ["id"]
          },
        ]
      }
      user_settings: {
        Row: {
          email_notifications: boolean
          email_unsubscribe_token: string
          terms_accepted_at: string | null
          terms_version: string | null
          updated_at: string
          user_id: string
        }
        Insert: {
          email_notifications?: boolean
          email_unsubscribe_token?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Update: {
          email_notifications?: boolean
          email_unsubscribe_token?: string
          terms_accepted_at?: string | null
          terms_version?: string | null
          updated_at?: string
          user_id?: string
        }
        Relationships: []
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      _notify: {
        Args: {
          _body: string
          _link: string
          _title: string
          _type: string
          _user: string
        }
        Returns: undefined
      }
      _notify_once: {
        Args: {
          _body: string
          _key: string
          _link: string
          _title: string
          _type: string
          _user: string
        }
        Returns: boolean
      }
      _profile_writable_by: {
        Args: { _profile_id: string; _user: string }
        Returns: boolean
      }
      _try_complete_claim: { Args: { _request_id: string }; Returns: boolean }
      accept_terms: { Args: { _version: string }; Returns: string }
      add_managed_profile: {
        Args: { _name: string; _relationship: string }
        Returns: string
      }
      can_read_holding: { Args: { _holding_id: string }; Returns: boolean }
      can_read_row: {
        Args: { _is_hidden: boolean; _profile_id: string }
        Returns: boolean
      }
      can_read_rsu_grant: { Args: { _grant_id: string }; Returns: boolean }
      can_see_profile: { Args: { _profile_id: string }; Returns: boolean }
      can_write_holding: { Args: { _holding_id: string }; Returns: boolean }
      can_write_profile: { Args: { _profile_id: string }; Returns: boolean }
      can_write_rsu_grant: { Args: { _grant_id: string }; Returns: boolean }
      cancel_join_request: { Args: { _request_id: string }; Returns: undefined }
      cas_next_import_date: { Args: { _profile_id: string }; Returns: string }
      check_cas_reminders: { Args: never; Returns: number }
      check_cas_reminders_for: { Args: { _user: string }; Returns: number }
      check_renewal_notifications: { Args: never; Returns: number }
      check_renewal_notifications_for: {
        Args: { _user: string }
        Returns: number
      }
      check_rsu_notifications: { Args: never; Returns: number }
      check_rsu_notifications_for: { Args: { _user: string }; Returns: number }
      complete_onboarding: {
        Args: { _base_currency: string; _country: string; _full_name: string }
        Returns: string
      }
      consume_cas_ai_call: { Args: never; Returns: boolean }
      create_household: { Args: { _name: string }; Returns: string }
      decide_claim: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      decide_join: {
        Args: { _approve: boolean; _request_id: string }
        Returns: undefined
      }
      delete_my_data: { Args: never; Returns: Json }
      gen_invite_code: { Args: never; Returns: string }
      get_invite_code: { Args: never; Returns: string }
      import_cas: {
        Args: { _profile_id: string; _statement: Json }
        Returns: Json
      }
      is_household_leader: { Args: { _household_id: string }; Returns: boolean }
      is_household_member: { Args: { _household_id: string }; Returns: boolean }
      is_profile_creator: { Args: { _profile_id: string }; Returns: boolean }
      latest_security_prices: {
        Args: never
        Returns: {
          close: number
          currency: string
          fetched_at: string
          prev_close: number | null
          price_date: string
          security_id: string
          source: string
        }[]
        SetofOptions: {
          from: "*"
          to: "security_prices"
          isOneToOne: false
          isSetofReturn: true
        }
      }
      leave_household: { Args: never; Returns: undefined }
      lookup_household: { Args: { _code: string }; Returns: Json }
      my_household_id: { Args: never; Returns: string }
      normalize_company_name: { Args: { _name: string }; Returns: string }
      profile_household_id: { Args: { _profile_id: string }; Returns: string }
      request_join: {
        Args: { _claim_profile_id: string; _code: string; _consent: boolean }
        Returns: string
      }
      rotate_invite_code: { Args: never; Returns: string }
      run_daily_notifications: { Args: never; Returns: number }
      search_securities: {
        Args: { _limit?: number; _q: string }
        Returns: {
          active: boolean
          country: string
          currency: string
          exchange: string
          id: string
          isin: string | null
          name: string
          symbol: string
          type: string
          updated_at: string
        }[]
        SetofOptions: {
          from: "*"
          to: "securities"
          isOneToOne: false
          isSetofReturn: true
        }
      }
    }
    Enums: {
      [_ in never]: never
    }
    CompositeTypes: {
      [_ in never]: never
    }
  }
}

type DatabaseWithoutInternals = Omit<Database, "__InternalSupabase">

type DefaultSchema = DatabaseWithoutInternals[Extract<keyof Database, "public">]

export type Tables<
  DefaultSchemaTableNameOrOptions extends
    | keyof (DefaultSchema["Tables"] & DefaultSchema["Views"])
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
      DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])[TableName] extends {
      Row: infer R
    }
    ? R
    : never
  : DefaultSchemaTableNameOrOptions extends keyof (DefaultSchema["Tables"] &
        DefaultSchema["Views"])
    ? (DefaultSchema["Tables"] &
        DefaultSchema["Views"])[DefaultSchemaTableNameOrOptions] extends {
        Row: infer R
      }
      ? R
      : never
    : never

export type TablesInsert<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Insert: infer I
    }
    ? I
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Insert: infer I
      }
      ? I
      : never
    : never

export type TablesUpdate<
  DefaultSchemaTableNameOrOptions extends
    | keyof DefaultSchema["Tables"]
    | { schema: keyof DatabaseWithoutInternals },
  TableName extends (DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never) = never,
> = DefaultSchemaTableNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"][TableName] extends {
      Update: infer U
    }
    ? U
    : never
  : DefaultSchemaTableNameOrOptions extends keyof DefaultSchema["Tables"]
    ? DefaultSchema["Tables"][DefaultSchemaTableNameOrOptions] extends {
        Update: infer U
      }
      ? U
      : never
    : never

export type Enums<
  DefaultSchemaEnumNameOrOptions extends
    | keyof DefaultSchema["Enums"]
    | { schema: keyof DatabaseWithoutInternals },
  EnumName extends (DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never) = never,
> = DefaultSchemaEnumNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"][EnumName]
  : DefaultSchemaEnumNameOrOptions extends keyof DefaultSchema["Enums"]
    ? DefaultSchema["Enums"][DefaultSchemaEnumNameOrOptions]
    : never

export type CompositeTypes<
  PublicCompositeTypeNameOrOptions extends
    | keyof DefaultSchema["CompositeTypes"]
    | { schema: keyof DatabaseWithoutInternals },
  CompositeTypeName extends (PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never) = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {},
  },
} as const
