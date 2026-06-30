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
    PostgrestVersion: "14.5"
  }
  public: {
    Tables: {
      account_balances: {
        Row: {
          abonos: number
          account_codigo: string
          cargos: number
          created_at: string
          ejercicio: number
          id: string
          moneda: string | null
          organization_id: string
          periodo: number
          saldo_final: number
          saldo_inicial: number
          updated_at: string
        }
        Insert: {
          abonos?: number
          account_codigo: string
          cargos?: number
          created_at?: string
          ejercicio: number
          id?: string
          moneda?: string | null
          organization_id: string
          periodo: number
          saldo_final?: number
          saldo_inicial?: number
          updated_at?: string
        }
        Update: {
          abonos?: number
          account_codigo?: string
          cargos?: number
          created_at?: string
          ejercicio?: number
          id?: string
          moneda?: string | null
          organization_id?: string
          periodo?: number
          saldo_final?: number
          saldo_inicial?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "account_balances_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      accounts: {
        Row: {
          activa: boolean
          acumulativa: boolean
          codigo: string
          codigo_agrupador: string | null
          created_at: string
          id: string
          naturaleza: Database["public"]["Enums"]["account_nature"]
          nivel: number
          nombre: string
          organization_id: string
          parent_id: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          acumulativa?: boolean
          codigo: string
          codigo_agrupador?: string | null
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["account_nature"]
          nivel?: number
          nombre: string
          organization_id: string
          parent_id?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          acumulativa?: boolean
          codigo?: string
          codigo_agrupador?: string | null
          created_at?: string
          id?: string
          naturaleza?: Database["public"]["Enums"]["account_nature"]
          nivel?: number
          nombre?: string
          organization_id?: string
          parent_id?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "accounts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "accounts_parent_id_fkey"
            columns: ["parent_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
        ]
      }
      aspel_raw_imports: {
        Row: {
          created_at: string
          created_by: string | null
          fields: Json | null
          file_name: string
          id: string
          import_job_id: string | null
          organization_id: string
          rows_total: number
          sistema: string
          table_detected: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          fields?: Json | null
          file_name: string
          id?: string
          import_job_id?: string | null
          organization_id: string
          rows_total?: number
          sistema?: string
          table_detected: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          fields?: Json | null
          file_name?: string
          id?: string
          import_job_id?: string | null
          organization_id?: string
          rows_total?: number
          sistema?: string
          table_detected?: string
        }
        Relationships: [
          {
            foreignKeyName: "aspel_raw_imports_import_job_id_fkey"
            columns: ["import_job_id"]
            isOneToOne: false
            referencedRelation: "import_jobs"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aspel_raw_imports_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      aspel_raw_rows: {
        Row: {
          created_at: string
          data: Json
          id: number
          organization_id: string
          raw_import_id: string
          row_index: number
          table_name: string
        }
        Insert: {
          created_at?: string
          data: Json
          id?: number
          organization_id: string
          raw_import_id: string
          row_index: number
          table_name: string
        }
        Update: {
          created_at?: string
          data?: Json
          id?: number
          organization_id?: string
          raw_import_id?: string
          row_index?: number
          table_name?: string
        }
        Relationships: [
          {
            foreignKeyName: "aspel_raw_rows_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "aspel_raw_rows_raw_import_id_fkey"
            columns: ["raw_import_id"]
            isOneToOne: false
            referencedRelation: "aspel_raw_imports"
            referencedColumns: ["id"]
          },
        ]
      }
      attendance_entries: {
        Row: {
          created_at: string
          created_by: string | null
          employee_id: string
          extra_codes: string[]
          fecha: string
          horas_extra_dobles: number
          horas_extra_triples: number
          id: string
          incident_code: string
          minutos_retardo: number
          observaciones: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          created_by?: string | null
          employee_id: string
          extra_codes?: string[]
          fecha: string
          horas_extra_dobles?: number
          horas_extra_triples?: number
          id?: string
          incident_code?: string
          minutos_retardo?: number
          observaciones?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          created_by?: string | null
          employee_id?: string
          extra_codes?: string[]
          fecha?: string
          horas_extra_dobles?: number
          horas_extra_triples?: number
          id?: string
          incident_code?: string
          minutos_retardo?: number
          observaciones?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      cfdi_stamps: {
        Row: {
          ambiente: string
          created_at: string
          error_message: string | null
          estatus: string
          facturapi_id: string | null
          fecha_timbrado: string | null
          folio: string | null
          id: string
          kind: string
          organization_id: string
          payload: Json | null
          pdf_path: string | null
          reference_id: string
          serie: string | null
          timbrado_por: string | null
          total: number | null
          updated_at: string
          uuid_sat: string | null
          xml_path: string | null
        }
        Insert: {
          ambiente?: string
          created_at?: string
          error_message?: string | null
          estatus?: string
          facturapi_id?: string | null
          fecha_timbrado?: string | null
          folio?: string | null
          id?: string
          kind: string
          organization_id: string
          payload?: Json | null
          pdf_path?: string | null
          reference_id: string
          serie?: string | null
          timbrado_por?: string | null
          total?: number | null
          updated_at?: string
          uuid_sat?: string | null
          xml_path?: string | null
        }
        Update: {
          ambiente?: string
          created_at?: string
          error_message?: string | null
          estatus?: string
          facturapi_id?: string | null
          fecha_timbrado?: string | null
          folio?: string | null
          id?: string
          kind?: string
          organization_id?: string
          payload?: Json | null
          pdf_path?: string | null
          reference_id?: string
          serie?: string | null
          timbrado_por?: string | null
          total?: number | null
          updated_at?: string
          uuid_sat?: string | null
          xml_path?: string | null
        }
        Relationships: []
      }
      cost_centers: {
        Row: {
          activa: boolean
          codigo: string
          created_at: string
          id: string
          nombre: string
          organization_id: string
          responsable: string | null
          updated_at: string
        }
        Insert: {
          activa?: boolean
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          organization_id: string
          responsable?: string | null
          updated_at?: string
        }
        Update: {
          activa?: boolean
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          organization_id?: string
          responsable?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "cost_centers_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      currencies: {
        Row: {
          codigo: string
          created_at: string
          id: string
          nombre: string
          organization_id: string
          simbolo: string | null
          tipo_cambio: number
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          nombre: string
          organization_id: string
          simbolo?: string | null
          tipo_cambio?: number
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          nombre?: string
          organization_id?: string
          simbolo?: string | null
          tipo_cambio?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "currencies_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customer_items: {
        Row: {
          clave_prod_serv: string
          clave_unidad: string
          created_at: string
          customer_id: string
          descripcion: string
          id: string
          ieps_tasa: number
          iva_tasa: number
          iva_tipo: string
          last_used_at: string | null
          moneda: string
          no_identificacion: string | null
          objeto_imp: string
          organization_id: string
          precio_unitario: number
          ret_isr_tasa: number
          ret_iva_tasa: number
          times_used: number
          unidad: string | null
          updated_at: string
        }
        Insert: {
          clave_prod_serv: string
          clave_unidad?: string
          created_at?: string
          customer_id: string
          descripcion: string
          id?: string
          ieps_tasa?: number
          iva_tasa?: number
          iva_tipo?: string
          last_used_at?: string | null
          moneda?: string
          no_identificacion?: string | null
          objeto_imp?: string
          organization_id: string
          precio_unitario?: number
          ret_isr_tasa?: number
          ret_iva_tasa?: number
          times_used?: number
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          clave_prod_serv?: string
          clave_unidad?: string
          created_at?: string
          customer_id?: string
          descripcion?: string
          id?: string
          ieps_tasa?: number
          iva_tasa?: number
          iva_tipo?: string
          last_used_at?: string | null
          moneda?: string
          no_identificacion?: string | null
          objeto_imp?: string
          organization_id?: string
          precio_unitario?: number
          ret_isr_tasa?: number
          ret_iva_tasa?: number
          times_used?: number
          unidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "customer_items_customer_id_fkey"
            columns: ["customer_id"]
            isOneToOne: false
            referencedRelation: "customers"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "customer_items_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      customers: {
        Row: {
          activo: boolean
          calle: string | null
          codigo_postal: string
          colonia: string | null
          created_at: string
          created_by: string | null
          dias_credito: number
          email: string | null
          estado: string | null
          forma_pago_default: string | null
          id: string
          metodo_pago_default: string
          moneda: string
          municipio: string | null
          nombre_comercial: string | null
          notas: string | null
          num_exterior: string | null
          num_interior: string | null
          organization_id: string
          pais: string
          razon_social: string
          regimen_fiscal: string
          rfc: string
          telefono: string | null
          updated_at: string
          uso_cfdi_default: string
        }
        Insert: {
          activo?: boolean
          calle?: string | null
          codigo_postal: string
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          dias_credito?: number
          email?: string | null
          estado?: string | null
          forma_pago_default?: string | null
          id?: string
          metodo_pago_default?: string
          moneda?: string
          municipio?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          num_exterior?: string | null
          num_interior?: string | null
          organization_id: string
          pais?: string
          razon_social: string
          regimen_fiscal?: string
          rfc: string
          telefono?: string | null
          updated_at?: string
          uso_cfdi_default?: string
        }
        Update: {
          activo?: boolean
          calle?: string | null
          codigo_postal?: string
          colonia?: string | null
          created_at?: string
          created_by?: string | null
          dias_credito?: number
          email?: string | null
          estado?: string | null
          forma_pago_default?: string | null
          id?: string
          metodo_pago_default?: string
          moneda?: string
          municipio?: string | null
          nombre_comercial?: string | null
          notas?: string | null
          num_exterior?: string | null
          num_interior?: string | null
          organization_id?: string
          pais?: string
          razon_social?: string
          regimen_fiscal?: string
          rfc?: string
          telefono?: string | null
          updated_at?: string
          uso_cfdi_default?: string
        }
        Relationships: []
      }
      employees: {
        Row: {
          apellido_materno: string | null
          apellido_paterno: string | null
          banco: string | null
          clabe: string | null
          cp_fiscal: string | null
          created_at: string
          curp: string | null
          departamento: string | null
          email: string | null
          empresa: string | null
          entidad_nacimiento: string | null
          estatus: Database["public"]["Enums"]["employee_status"]
          fecha_alta: string
          fecha_baja: string | null
          fecha_nacimiento: string | null
          forma_pago: string | null
          id: string
          infonavit_credito: string | null
          infonavit_cuota_mensual: number
          infonavit_factor_descuento: number | null
          infonavit_fecha_inicio: string | null
          infonavit_tipo_descuento: string | null
          nombre: string
          nss: string | null
          numero: string
          ocupacion: string | null
          organization_id: string
          patron_id: string | null
          periodicidad: Database["public"]["Enums"]["payroll_periodicity"]
          puesto: string | null
          regimen_fiscal_receptor: string | null
          rfc: string | null
          riesgo_puesto: number | null
          salario_diario: number
          sdi: number
          sexo: string | null
          telefono: string | null
          tipo_regimen: string | null
          umf: string | null
          updated_at: string
        }
        Insert: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          banco?: string | null
          clabe?: string | null
          cp_fiscal?: string | null
          created_at?: string
          curp?: string | null
          departamento?: string | null
          email?: string | null
          empresa?: string | null
          entidad_nacimiento?: string | null
          estatus?: Database["public"]["Enums"]["employee_status"]
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          forma_pago?: string | null
          id?: string
          infonavit_credito?: string | null
          infonavit_cuota_mensual?: number
          infonavit_factor_descuento?: number | null
          infonavit_fecha_inicio?: string | null
          infonavit_tipo_descuento?: string | null
          nombre: string
          nss?: string | null
          numero: string
          ocupacion?: string | null
          organization_id: string
          patron_id?: string | null
          periodicidad?: Database["public"]["Enums"]["payroll_periodicity"]
          puesto?: string | null
          regimen_fiscal_receptor?: string | null
          rfc?: string | null
          riesgo_puesto?: number | null
          salario_diario?: number
          sdi?: number
          sexo?: string | null
          telefono?: string | null
          tipo_regimen?: string | null
          umf?: string | null
          updated_at?: string
        }
        Update: {
          apellido_materno?: string | null
          apellido_paterno?: string | null
          banco?: string | null
          clabe?: string | null
          cp_fiscal?: string | null
          created_at?: string
          curp?: string | null
          departamento?: string | null
          email?: string | null
          empresa?: string | null
          entidad_nacimiento?: string | null
          estatus?: Database["public"]["Enums"]["employee_status"]
          fecha_alta?: string
          fecha_baja?: string | null
          fecha_nacimiento?: string | null
          forma_pago?: string | null
          id?: string
          infonavit_credito?: string | null
          infonavit_cuota_mensual?: number
          infonavit_factor_descuento?: number | null
          infonavit_fecha_inicio?: string | null
          infonavit_tipo_descuento?: string | null
          nombre?: string
          nss?: string | null
          numero?: string
          ocupacion?: string | null
          organization_id?: string
          patron_id?: string | null
          periodicidad?: Database["public"]["Enums"]["payroll_periodicity"]
          puesto?: string | null
          regimen_fiscal_receptor?: string | null
          rfc?: string | null
          riesgo_puesto?: number | null
          salario_diario?: number
          sdi?: number
          sexo?: string | null
          telefono?: string | null
          tipo_regimen?: string | null
          umf?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "employees_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "employees_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "imss_patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      fiscal_params: {
        Row: {
          clave: string
          ejercicio: number
          id: string
          valor: number
          vigente_desde: string | null
        }
        Insert: {
          clave: string
          ejercicio: number
          id?: string
          valor: number
          vigente_desde?: string | null
        }
        Update: {
          clave?: string
          ejercicio?: number
          id?: string
          valor?: number
          vigente_desde?: string | null
        }
        Relationships: []
      }
      fiscal_years: {
        Row: {
          created_at: string
          ejercicio: number
          estatus: string
          fecha_apertura: string | null
          fecha_cierre: string | null
          id: string
          organization_id: string
          periodo: number
          updated_at: string
        }
        Insert: {
          created_at?: string
          ejercicio: number
          estatus?: string
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          organization_id: string
          periodo: number
          updated_at?: string
        }
        Update: {
          created_at?: string
          ejercicio?: number
          estatus?: string
          fecha_apertura?: string | null
          fecha_cierre?: string | null
          id?: string
          organization_id?: string
          periodo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "fiscal_years_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      import_jobs: {
        Row: {
          completed_at: string | null
          created_at: string
          created_by: string
          file_name: string
          id: string
          kind: Database["public"]["Enums"]["import_kind"]
          log: Json | null
          organization_id: string
          rows_error: number | null
          rows_ok: number | null
          rows_total: number | null
          status: Database["public"]["Enums"]["import_status"]
          storage_path: string | null
        }
        Insert: {
          completed_at?: string | null
          created_at?: string
          created_by: string
          file_name: string
          id?: string
          kind: Database["public"]["Enums"]["import_kind"]
          log?: Json | null
          organization_id: string
          rows_error?: number | null
          rows_ok?: number | null
          rows_total?: number | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
        }
        Update: {
          completed_at?: string | null
          created_at?: string
          created_by?: string
          file_name?: string
          id?: string
          kind?: Database["public"]["Enums"]["import_kind"]
          log?: Json | null
          organization_id?: string
          rows_error?: number | null
          rows_ok?: number | null
          rows_total?: number | null
          status?: Database["public"]["Enums"]["import_status"]
          storage_path?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "import_jobs_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_bimestre_detalle: {
        Row: {
          ausencias_mes1: number | null
          ausencias_mes2: number | null
          bimestre_id: string
          created_at: string
          cv: number | null
          dias_mes1: number
          dias_mes2: number
          efm_cf_mes1: number | null
          efm_cf_mes2: number | null
          efm_din_mes1: number | null
          efm_din_mes2: number | null
          efm_exc_mes1: number | null
          efm_exc_mes2: number | null
          employee_id: string
          gmp_mes1: number | null
          gmp_mes2: number | null
          guard_mes1: number | null
          guard_mes2: number | null
          id: string
          incap_mes1: number | null
          incap_mes2: number | null
          infonavit: number | null
          iv_mes1: number | null
          iv_mes2: number | null
          organization_id: string
          retiro: number | null
          rt_mes1: number | null
          rt_mes2: number | null
          sbc: number
          total: number | null
          total_imss_mes1: number | null
          total_imss_mes2: number | null
          total_rcv: number | null
        }
        Insert: {
          ausencias_mes1?: number | null
          ausencias_mes2?: number | null
          bimestre_id: string
          created_at?: string
          cv?: number | null
          dias_mes1?: number
          dias_mes2?: number
          efm_cf_mes1?: number | null
          efm_cf_mes2?: number | null
          efm_din_mes1?: number | null
          efm_din_mes2?: number | null
          efm_exc_mes1?: number | null
          efm_exc_mes2?: number | null
          employee_id: string
          gmp_mes1?: number | null
          gmp_mes2?: number | null
          guard_mes1?: number | null
          guard_mes2?: number | null
          id?: string
          incap_mes1?: number | null
          incap_mes2?: number | null
          infonavit?: number | null
          iv_mes1?: number | null
          iv_mes2?: number | null
          organization_id: string
          retiro?: number | null
          rt_mes1?: number | null
          rt_mes2?: number | null
          sbc: number
          total?: number | null
          total_imss_mes1?: number | null
          total_imss_mes2?: number | null
          total_rcv?: number | null
        }
        Update: {
          ausencias_mes1?: number | null
          ausencias_mes2?: number | null
          bimestre_id?: string
          created_at?: string
          cv?: number | null
          dias_mes1?: number
          dias_mes2?: number
          efm_cf_mes1?: number | null
          efm_cf_mes2?: number | null
          efm_din_mes1?: number | null
          efm_din_mes2?: number | null
          efm_exc_mes1?: number | null
          efm_exc_mes2?: number | null
          employee_id?: string
          gmp_mes1?: number | null
          gmp_mes2?: number | null
          guard_mes1?: number | null
          guard_mes2?: number | null
          id?: string
          incap_mes1?: number | null
          incap_mes2?: number | null
          infonavit?: number | null
          iv_mes1?: number | null
          iv_mes2?: number | null
          organization_id?: string
          retiro?: number | null
          rt_mes1?: number | null
          rt_mes2?: number | null
          sbc?: number
          total?: number | null
          total_imss_mes1?: number | null
          total_imss_mes2?: number | null
          total_rcv?: number | null
        }
        Relationships: [
          {
            foreignKeyName: "imss_bimestre_detalle_bimestre_id_fkey"
            columns: ["bimestre_id"]
            isOneToOne: false
            referencedRelation: "imss_bimestres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_bimestre_detalle_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_bimestre_detalle_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_bimestres: {
        Row: {
          bimestre: number
          calculado_at: string | null
          created_at: string
          ejercicio: number
          estatus: string
          id: string
          organization_id: string
          patron_id: string
          total_bimestre: number | null
          total_imss_mes1: number | null
          total_imss_mes2: number | null
          total_infonavit: number | null
          total_rcv: number | null
          updated_at: string
        }
        Insert: {
          bimestre: number
          calculado_at?: string | null
          created_at?: string
          ejercicio: number
          estatus?: string
          id?: string
          organization_id: string
          patron_id: string
          total_bimestre?: number | null
          total_imss_mes1?: number | null
          total_imss_mes2?: number | null
          total_infonavit?: number | null
          total_rcv?: number | null
          updated_at?: string
        }
        Update: {
          bimestre?: number
          calculado_at?: string | null
          created_at?: string
          ejercicio?: number
          estatus?: string
          id?: string
          organization_id?: string
          patron_id?: string
          total_bimestre?: number | null
          total_imss_mes1?: number | null
          total_imss_mes2?: number | null
          total_infonavit?: number | null
          total_rcv?: number | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imss_bimestres_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_bimestres_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "imss_patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_mensual_detalle: {
        Row: {
          ausencias: number
          created_at: string
          dias_cot: number
          efm_cf: number
          efm_din: number
          efm_exc: number
          employee_id: string
          gmp: number
          guarderias: number
          id: string
          incapacidades: number
          iv: number
          mensual_id: string
          organization_id: string
          rt: number
          sbc: number
          total: number
        }
        Insert: {
          ausencias?: number
          created_at?: string
          dias_cot?: number
          efm_cf?: number
          efm_din?: number
          efm_exc?: number
          employee_id: string
          gmp?: number
          guarderias?: number
          id?: string
          incapacidades?: number
          iv?: number
          mensual_id: string
          organization_id: string
          rt?: number
          sbc?: number
          total?: number
        }
        Update: {
          ausencias?: number
          created_at?: string
          dias_cot?: number
          efm_cf?: number
          efm_din?: number
          efm_exc?: number
          employee_id?: string
          gmp?: number
          guarderias?: number
          id?: string
          incapacidades?: number
          iv?: number
          mensual_id?: string
          organization_id?: string
          rt?: number
          sbc?: number
          total?: number
        }
        Relationships: [
          {
            foreignKeyName: "imss_mensual_detalle_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_mensual_detalle_mensual_id_fkey"
            columns: ["mensual_id"]
            isOneToOne: false
            referencedRelation: "imss_mensuales"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_mensual_detalle_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_mensuales: {
        Row: {
          calculado_at: string | null
          created_at: string
          ejercicio: number
          estatus: string
          id: string
          mes: number
          organization_id: string
          patron_id: string
          total_efm: number
          total_gmp: number
          total_guarderias: number
          total_iv: number
          total_mes: number
          total_rt: number
          updated_at: string
        }
        Insert: {
          calculado_at?: string | null
          created_at?: string
          ejercicio: number
          estatus?: string
          id?: string
          mes: number
          organization_id: string
          patron_id: string
          total_efm?: number
          total_gmp?: number
          total_guarderias?: number
          total_iv?: number
          total_mes?: number
          total_rt?: number
          updated_at?: string
        }
        Update: {
          calculado_at?: string | null
          created_at?: string
          ejercicio?: number
          estatus?: string
          id?: string
          mes?: number
          organization_id?: string
          patron_id?: string
          total_efm?: number
          total_gmp?: number
          total_guarderias?: number
          total_iv?: number
          total_mes?: number
          total_rt?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imss_mensuales_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_mensuales_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "imss_patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_movimientos: {
        Row: {
          archivo_url: string | null
          created_at: string
          dias: number | null
          employee_id: string
          enviado_at: string | null
          estatus: string
          fecha_fin: string | null
          fecha_movimiento: string
          folio_idse: string | null
          id: string
          motivo_baja: string | null
          observaciones: string | null
          organization_id: string
          patron_id: string
          ramo_incapacidad: string | null
          sdi_anterior: number | null
          sdi_nuevo: number | null
          tipo: string
          tipo_incapacidad: string | null
          updated_at: string
        }
        Insert: {
          archivo_url?: string | null
          created_at?: string
          dias?: number | null
          employee_id: string
          enviado_at?: string | null
          estatus?: string
          fecha_fin?: string | null
          fecha_movimiento: string
          folio_idse?: string | null
          id?: string
          motivo_baja?: string | null
          observaciones?: string | null
          organization_id: string
          patron_id: string
          ramo_incapacidad?: string | null
          sdi_anterior?: number | null
          sdi_nuevo?: number | null
          tipo: string
          tipo_incapacidad?: string | null
          updated_at?: string
        }
        Update: {
          archivo_url?: string | null
          created_at?: string
          dias?: number | null
          employee_id?: string
          enviado_at?: string | null
          estatus?: string
          fecha_fin?: string | null
          fecha_movimiento?: string
          folio_idse?: string | null
          id?: string
          motivo_baja?: string | null
          observaciones?: string | null
          organization_id?: string
          patron_id?: string
          ramo_incapacidad?: string | null
          sdi_anterior?: number | null
          sdi_nuevo?: number | null
          tipo?: string
          tipo_incapacidad?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imss_movimientos_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_movimientos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_movimientos_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "imss_patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_pagos: {
        Row: {
          bimestre_id: string
          comprobante_url: string | null
          concepto: string
          created_at: string
          fecha_pago: string | null
          fecha_vencimiento: string | null
          id: string
          importe: number
          linea_captura: string | null
          organization_id: string
          referencia: string | null
          updated_at: string
        }
        Insert: {
          bimestre_id: string
          comprobante_url?: string | null
          concepto: string
          created_at?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          importe: number
          linea_captura?: string | null
          organization_id: string
          referencia?: string | null
          updated_at?: string
        }
        Update: {
          bimestre_id?: string
          comprobante_url?: string | null
          concepto?: string
          created_at?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string | null
          id?: string
          importe?: number
          linea_captura?: string | null
          organization_id?: string
          referencia?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "imss_pagos_bimestre_id_fkey"
            columns: ["bimestre_id"]
            isOneToOne: false
            referencedRelation: "imss_bimestres"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_pagos_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_patrones: {
        Row: {
          actividad_economica: string | null
          activo: boolean
          area_geografica: string | null
          clase_riesgo: string | null
          cp: string | null
          created_at: string
          curp_patron: string | null
          delegacion: string | null
          domicilio: string | null
          estado: string | null
          fraccion: string | null
          id: string
          modalidad: string | null
          municipio: string | null
          organization_id: string
          prima_riesgo: number
          prima_riesgo_vigencia: string | null
          razon_social: string
          registro_patronal: string
          representante_legal: string | null
          rfc_patron: string
          subdelegacion: string | null
          subdelegacion_clave: string | null
          telefono: string | null
          updated_at: string
          zona_salario: string | null
        }
        Insert: {
          actividad_economica?: string | null
          activo?: boolean
          area_geografica?: string | null
          clase_riesgo?: string | null
          cp?: string | null
          created_at?: string
          curp_patron?: string | null
          delegacion?: string | null
          domicilio?: string | null
          estado?: string | null
          fraccion?: string | null
          id?: string
          modalidad?: string | null
          municipio?: string | null
          organization_id: string
          prima_riesgo?: number
          prima_riesgo_vigencia?: string | null
          razon_social: string
          registro_patronal: string
          representante_legal?: string | null
          rfc_patron: string
          subdelegacion?: string | null
          subdelegacion_clave?: string | null
          telefono?: string | null
          updated_at?: string
          zona_salario?: string | null
        }
        Update: {
          actividad_economica?: string | null
          activo?: boolean
          area_geografica?: string | null
          clase_riesgo?: string | null
          cp?: string | null
          created_at?: string
          curp_patron?: string | null
          delegacion?: string | null
          domicilio?: string | null
          estado?: string | null
          fraccion?: string | null
          id?: string
          modalidad?: string | null
          municipio?: string | null
          organization_id?: string
          prima_riesgo?: number
          prima_riesgo_vigencia?: string | null
          razon_social?: string
          registro_patronal?: string
          representante_legal?: string | null
          rfc_patron?: string
          subdelegacion?: string | null
          subdelegacion_clave?: string | null
          telefono?: string | null
          updated_at?: string
          zona_salario?: string | null
        }
        Relationships: [
          {
            foreignKeyName: "imss_patrones_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      imss_primas_rt: {
        Row: {
          created_at: string
          ejercicio: number
          id: string
          mes: number
          organization_id: string
          patron_id: string
          prima: number
        }
        Insert: {
          created_at?: string
          ejercicio: number
          id?: string
          mes?: number
          organization_id: string
          patron_id: string
          prima: number
        }
        Update: {
          created_at?: string
          ejercicio?: number
          id?: string
          mes?: number
          organization_id?: string
          patron_id?: string
          prima?: number
        }
        Relationships: [
          {
            foreignKeyName: "imss_primas_rt_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "imss_primas_rt_patron_id_fkey"
            columns: ["patron_id"]
            isOneToOne: false
            referencedRelation: "imss_patrones"
            referencedColumns: ["id"]
          },
        ]
      }
      incident_types: {
        Row: {
          codigo: string
          color: string
          cuenta_falta: boolean
          descripcion: string | null
          id: string
          nombre: string
          orden: number
          paga: boolean
        }
        Insert: {
          codigo: string
          color?: string
          cuenta_falta?: boolean
          descripcion?: string | null
          id?: string
          nombre: string
          orden?: number
          paga?: boolean
        }
        Update: {
          codigo?: string
          color?: string
          cuenta_falta?: boolean
          descripcion?: string | null
          id?: string
          nombre?: string
          orden?: number
          paga?: boolean
        }
        Relationships: []
      }
      journal_entries: {
        Row: {
          concepto: string
          created_at: string
          created_by: string
          estatus: Database["public"]["Enums"]["journal_status"]
          fecha: string
          id: string
          numero: number
          organization_id: string
          referencia: string | null
          tipo: Database["public"]["Enums"]["journal_type"]
          total_abono: number
          total_cargo: number
          updated_at: string
        }
        Insert: {
          concepto: string
          created_at?: string
          created_by: string
          estatus?: Database["public"]["Enums"]["journal_status"]
          fecha: string
          id?: string
          numero: number
          organization_id: string
          referencia?: string | null
          tipo: Database["public"]["Enums"]["journal_type"]
          total_abono?: number
          total_cargo?: number
          updated_at?: string
        }
        Update: {
          concepto?: string
          created_at?: string
          created_by?: string
          estatus?: Database["public"]["Enums"]["journal_status"]
          fecha?: string
          id?: string
          numero?: number
          organization_id?: string
          referencia?: string | null
          tipo?: Database["public"]["Enums"]["journal_type"]
          total_abono?: number
          total_cargo?: number
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_entries_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_lines: {
        Row: {
          abono: number
          account_id: string
          cargo: number
          concepto: string | null
          entry_id: string
          id: string
          orden: number
          organization_id: string
        }
        Insert: {
          abono?: number
          account_id: string
          cargo?: number
          concepto?: string | null
          entry_id: string
          id?: string
          orden?: number
          organization_id: string
        }
        Update: {
          abono?: number
          account_id?: string
          cargo?: number
          concepto?: string | null
          entry_id?: string
          id?: string
          orden?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_lines_account_id_fkey"
            columns: ["account_id"]
            isOneToOne: false
            referencedRelation: "accounts"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_entry_id_fkey"
            columns: ["entry_id"]
            isOneToOne: false
            referencedRelation: "journal_entries"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "journal_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      journal_types_catalog: {
        Row: {
          codigo: string
          created_at: string
          id: string
          naturaleza: string | null
          nombre: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          codigo: string
          created_at?: string
          id?: string
          naturaleza?: string | null
          nombre: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          codigo?: string
          created_at?: string
          id?: string
          naturaleza?: string | null
          nombre?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "journal_types_catalog_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      operators: {
        Row: {
          created_at: string
          curp: string | null
          id: string
          nombre: string
          num_licencia: string
          num_reg_id_trib: string | null
          organization_id: string
          residencia_fiscal: string | null
          rfc: string
          updated_at: string
        }
        Insert: {
          created_at?: string
          curp?: string | null
          id?: string
          nombre: string
          num_licencia: string
          num_reg_id_trib?: string | null
          organization_id: string
          residencia_fiscal?: string | null
          rfc: string
          updated_at?: string
        }
        Update: {
          created_at?: string
          curp?: string | null
          id?: string
          nombre?: string
          num_licencia?: string
          num_reg_id_trib?: string | null
          organization_id?: string
          residencia_fiscal?: string | null
          rfc?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "operators_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      org_billing_config: {
        Row: {
          created_at: string
          csd_expires_at: string | null
          csd_uploaded_at: string | null
          environment: string
          facturapi_live_key: string | null
          facturapi_org_id: string | null
          facturapi_test_key: string | null
          id: string
          organization_id: string
          updated_at: string
          updated_by: string | null
        }
        Insert: {
          created_at?: string
          csd_expires_at?: string | null
          csd_uploaded_at?: string | null
          environment?: string
          facturapi_live_key?: string | null
          facturapi_org_id?: string | null
          facturapi_test_key?: string | null
          id?: string
          organization_id: string
          updated_at?: string
          updated_by?: string | null
        }
        Update: {
          created_at?: string
          csd_expires_at?: string | null
          csd_uploaded_at?: string | null
          environment?: string
          facturapi_live_key?: string | null
          facturapi_org_id?: string | null
          facturapi_test_key?: string | null
          id?: string
          organization_id?: string
          updated_at?: string
          updated_by?: string | null
        }
        Relationships: []
      }
      org_modules: {
        Row: {
          activado_en: string
          activado_por: string | null
          activo: boolean
          costo_mensual: number
          created_at: string
          id: string
          modulo: string
          organization_id: string
          updated_at: string
        }
        Insert: {
          activado_en?: string
          activado_por?: string | null
          activo?: boolean
          costo_mensual?: number
          created_at?: string
          id?: string
          modulo: string
          organization_id: string
          updated_at?: string
        }
        Update: {
          activado_en?: string
          activado_por?: string | null
          activo?: boolean
          costo_mensual?: number
          created_at?: string
          id?: string
          modulo?: string
          organization_id?: string
          updated_at?: string
        }
        Relationships: []
      }
      organization_members: {
        Row: {
          created_at: string
          id: string
          organization_id: string
          role: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          organization_id: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          organization_id?: string
          role?: Database["public"]["Enums"]["app_role"]
          user_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "organization_members_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      organization_requests: {
        Row: {
          admin_notes: string | null
          codigo_postal: string | null
          created_at: string
          created_organization_id: string | null
          id: string
          motivo: string | null
          razon_social: string
          regimen_fiscal: string | null
          requested_by: string
          resolved_at: string | null
          resolved_by: string | null
          rfc: string
          status: Database["public"]["Enums"]["org_request_status"]
          updated_at: string
        }
        Insert: {
          admin_notes?: string | null
          codigo_postal?: string | null
          created_at?: string
          created_organization_id?: string | null
          id?: string
          motivo?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          requested_by: string
          resolved_at?: string | null
          resolved_by?: string | null
          rfc: string
          status?: Database["public"]["Enums"]["org_request_status"]
          updated_at?: string
        }
        Update: {
          admin_notes?: string | null
          codigo_postal?: string | null
          created_at?: string
          created_organization_id?: string | null
          id?: string
          motivo?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          requested_by?: string
          resolved_at?: string | null
          resolved_by?: string | null
          rfc?: string
          status?: Database["public"]["Enums"]["org_request_status"]
          updated_at?: string
        }
        Relationships: []
      }
      organizations: {
        Row: {
          codigo_postal: string | null
          created_at: string
          created_by: string
          direccion: string | null
          id: string
          logo_url: string | null
          moneda: string
          nombre_comercial: string | null
          razon_social: string
          regimen_fiscal: string | null
          rfc: string
          timezone: string
          updated_at: string
        }
        Insert: {
          codigo_postal?: string | null
          created_at?: string
          created_by: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre_comercial?: string | null
          razon_social: string
          regimen_fiscal?: string | null
          rfc: string
          timezone?: string
          updated_at?: string
        }
        Update: {
          codigo_postal?: string | null
          created_at?: string
          created_by?: string
          direccion?: string | null
          id?: string
          logo_url?: string | null
          moneda?: string
          nombre_comercial?: string | null
          razon_social?: string
          regimen_fiscal?: string | null
          rfc?: string
          timezone?: string
          updated_at?: string
        }
        Relationships: []
      }
      payroll_concepts: {
        Row: {
          activo: boolean
          clave_propia: string | null
          clave_sat: string
          created_at: string
          descripcion: string
          gravado_isr: boolean
          id: string
          integra_sbc: boolean
          organization_id: string
          tipo: Database["public"]["Enums"]["concept_type"]
        }
        Insert: {
          activo?: boolean
          clave_propia?: string | null
          clave_sat: string
          created_at?: string
          descripcion: string
          gravado_isr?: boolean
          id?: string
          integra_sbc?: boolean
          organization_id: string
          tipo: Database["public"]["Enums"]["concept_type"]
        }
        Update: {
          activo?: boolean
          clave_propia?: string | null
          clave_sat?: string
          created_at?: string
          descripcion?: string
          gravado_isr?: boolean
          id?: string
          integra_sbc?: boolean
          organization_id?: string
          tipo?: Database["public"]["Enums"]["concept_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_concepts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_email_logs: {
        Row: {
          created_at: string
          details: Json
          from_email: string | null
          id: string
          organization_id: string
          payroll_period_id: string
          sent_by: string | null
          sin_email: number
          summary_cc: string[] | null
          summary_error: string | null
          summary_sent: boolean
          summary_to: string[] | null
          total_failed: number
          total_recipients: number
          total_sent: number
          total_skipped: number
        }
        Insert: {
          created_at?: string
          details?: Json
          from_email?: string | null
          id?: string
          organization_id: string
          payroll_period_id: string
          sent_by?: string | null
          sin_email?: number
          summary_cc?: string[] | null
          summary_error?: string | null
          summary_sent?: boolean
          summary_to?: string[] | null
          total_failed?: number
          total_recipients?: number
          total_sent?: number
          total_skipped?: number
        }
        Update: {
          created_at?: string
          details?: Json
          from_email?: string | null
          id?: string
          organization_id?: string
          payroll_period_id?: string
          sent_by?: string | null
          sin_email?: number
          summary_cc?: string[] | null
          summary_error?: string | null
          summary_sent?: boolean
          summary_to?: string[] | null
          total_failed?: number
          total_recipients?: number
          total_sent?: number
          total_skipped?: number
        }
        Relationships: []
      }
      payroll_periods: {
        Row: {
          created_at: string
          dias: number
          ejercicio: number
          estatus: Database["public"]["Enums"]["payroll_period_status"]
          fecha_fin: string
          fecha_inicio: string
          fecha_pago: string
          id: string
          numero: number
          organization_id: string
          periodicidad: Database["public"]["Enums"]["payroll_periodicity"]
        }
        Insert: {
          created_at?: string
          dias: number
          ejercicio: number
          estatus?: Database["public"]["Enums"]["payroll_period_status"]
          fecha_fin: string
          fecha_inicio: string
          fecha_pago: string
          id?: string
          numero: number
          organization_id: string
          periodicidad: Database["public"]["Enums"]["payroll_periodicity"]
        }
        Update: {
          created_at?: string
          dias?: number
          ejercicio?: number
          estatus?: Database["public"]["Enums"]["payroll_period_status"]
          fecha_fin?: string
          fecha_inicio?: string
          fecha_pago?: string
          id?: string
          numero?: number
          organization_id?: string
          periodicidad?: Database["public"]["Enums"]["payroll_periodicity"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_receipt_lines: {
        Row: {
          concepto_clave: string
          descripcion: string
          id: string
          importe_exento: number
          importe_gravado: number
          organization_id: string
          receipt_id: string
          tipo: Database["public"]["Enums"]["concept_type"]
        }
        Insert: {
          concepto_clave: string
          descripcion: string
          id?: string
          importe_exento?: number
          importe_gravado?: number
          organization_id: string
          receipt_id: string
          tipo: Database["public"]["Enums"]["concept_type"]
        }
        Update: {
          concepto_clave?: string
          descripcion?: string
          id?: string
          importe_exento?: number
          importe_gravado?: number
          organization_id?: string
          receipt_id?: string
          tipo?: Database["public"]["Enums"]["concept_type"]
        }
        Relationships: [
          {
            foreignKeyName: "payroll_receipt_lines_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_receipt_lines_receipt_id_fkey"
            columns: ["receipt_id"]
            isOneToOne: false
            referencedRelation: "payroll_receipts"
            referencedColumns: ["id"]
          },
        ]
      }
      payroll_receipts: {
        Row: {
          created_at: string
          dias_pagados: number
          employee_id: string
          id: string
          imss_obrero: number
          isr: number
          neto_pagar: number
          observaciones: string | null
          organization_id: string
          payroll_period_id: string
          sdi: number
          subsidio: number
          sueldo_diario: number
          total_deducciones: number
          total_exento: number
          total_gravado: number
          total_percepciones: number
        }
        Insert: {
          created_at?: string
          dias_pagados: number
          employee_id: string
          id?: string
          imss_obrero?: number
          isr?: number
          neto_pagar?: number
          observaciones?: string | null
          organization_id: string
          payroll_period_id: string
          sdi: number
          subsidio?: number
          sueldo_diario: number
          total_deducciones?: number
          total_exento?: number
          total_gravado?: number
          total_percepciones?: number
        }
        Update: {
          created_at?: string
          dias_pagados?: number
          employee_id?: string
          id?: string
          imss_obrero?: number
          isr?: number
          neto_pagar?: number
          observaciones?: string | null
          organization_id?: string
          payroll_period_id?: string
          sdi?: number
          subsidio?: number
          sueldo_diario?: number
          total_deducciones?: number
          total_exento?: number
          total_gravado?: number
          total_percepciones?: number
        }
        Relationships: [
          {
            foreignKeyName: "payroll_receipts_employee_id_fkey"
            columns: ["employee_id"]
            isOneToOne: false
            referencedRelation: "employees"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_receipts_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
          {
            foreignKeyName: "payroll_receipts_payroll_period_id_fkey"
            columns: ["payroll_period_id"]
            isOneToOne: false
            referencedRelation: "payroll_periods"
            referencedColumns: ["id"]
          },
        ]
      }
      periods: {
        Row: {
          cerrado: boolean
          created_at: string
          ejercicio: number
          fecha_cierre: string | null
          id: string
          mes: number
          organization_id: string
        }
        Insert: {
          cerrado?: boolean
          created_at?: string
          ejercicio: number
          fecha_cierre?: string | null
          id?: string
          mes: number
          organization_id: string
        }
        Update: {
          cerrado?: boolean
          created_at?: string
          ejercicio?: number
          fecha_cierre?: string | null
          id?: string
          mes?: number
          organization_id?: string
        }
        Relationships: [
          {
            foreignKeyName: "periods_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      platform_admins: {
        Row: {
          created_at: string
          id: string
          notes: string | null
          user_id: string
        }
        Insert: {
          created_at?: string
          id?: string
          notes?: string | null
          user_id: string
        }
        Update: {
          created_at?: string
          id?: string
          notes?: string | null
          user_id?: string
        }
        Relationships: []
      }
      products: {
        Row: {
          activo: boolean
          clave: string
          clave_prod_serv: string
          clave_unidad: string
          created_at: string
          created_by: string | null
          descripcion: string
          id: string
          ieps_tasa: number
          iva_tasa: number
          iva_tipo: string
          moneda: string
          objeto_imp: string
          organization_id: string
          precio_unitario: number
          ret_isr_tasa: number
          ret_iva_tasa: number
          sku: string | null
          tipo: string
          unidad: string | null
          updated_at: string
        }
        Insert: {
          activo?: boolean
          clave: string
          clave_prod_serv: string
          clave_unidad: string
          created_at?: string
          created_by?: string | null
          descripcion: string
          id?: string
          ieps_tasa?: number
          iva_tasa?: number
          iva_tipo?: string
          moneda?: string
          objeto_imp?: string
          organization_id: string
          precio_unitario?: number
          ret_isr_tasa?: number
          ret_iva_tasa?: number
          sku?: string | null
          tipo?: string
          unidad?: string | null
          updated_at?: string
        }
        Update: {
          activo?: boolean
          clave?: string
          clave_prod_serv?: string
          clave_unidad?: string
          created_at?: string
          created_by?: string | null
          descripcion?: string
          id?: string
          ieps_tasa?: number
          iva_tasa?: number
          iva_tipo?: string
          moneda?: string
          objeto_imp?: string
          organization_id?: string
          precio_unitario?: number
          ret_isr_tasa?: number
          ret_iva_tasa?: number
          sku?: string | null
          tipo?: string
          unidad?: string | null
          updated_at?: string
        }
        Relationships: []
      }
      profiles: {
        Row: {
          avatar_url: string | null
          created_at: string
          email: string | null
          full_name: string | null
          id: string
          updated_at: string
        }
        Insert: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id: string
          updated_at?: string
        }
        Update: {
          avatar_url?: string | null
          created_at?: string
          email?: string | null
          full_name?: string | null
          id?: string
          updated_at?: string
        }
        Relationships: []
      }
      sat_account_map: {
        Row: {
          account_codigo: string
          codigo_agrupador: string
          created_at: string
          id: string
          nombre_sat: string | null
          organization_id: string
          updated_at: string
        }
        Insert: {
          account_codigo: string
          codigo_agrupador: string
          created_at?: string
          id?: string
          nombre_sat?: string | null
          organization_id: string
          updated_at?: string
        }
        Update: {
          account_codigo?: string
          codigo_agrupador?: string
          created_at?: string
          id?: string
          nombre_sat?: string | null
          organization_id?: string
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "sat_account_map_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
      stamp_usage_log: {
        Row: {
          costo: number
          created_at: string
          created_by: string | null
          id: string
          kind: Database["public"]["Enums"]["stamp_kind"]
          organization_id: string
          reference_id: string | null
          uuid_cfdi: string | null
        }
        Insert: {
          costo?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind: Database["public"]["Enums"]["stamp_kind"]
          organization_id: string
          reference_id?: string | null
          uuid_cfdi?: string | null
        }
        Update: {
          costo?: number
          created_at?: string
          created_by?: string | null
          id?: string
          kind?: Database["public"]["Enums"]["stamp_kind"]
          organization_id?: string
          reference_id?: string | null
          uuid_cfdi?: string | null
        }
        Relationships: []
      }
      subscription_invoices: {
        Row: {
          comprobante_url: string | null
          created_at: string
          created_by: string | null
          ejercicio: number
          estatus: string
          fecha_emision: string
          fecha_pago: string | null
          fecha_vencimiento: string
          id: string
          mes: number
          metodo_pago: string
          monto_base: number
          monto_total: number
          notas: string | null
          organization_id: string
          stripe_payment_intent: string | null
          surcharge: number
          updated_at: string
        }
        Insert: {
          comprobante_url?: string | null
          created_at?: string
          created_by?: string | null
          ejercicio: number
          estatus?: string
          fecha_emision?: string
          fecha_pago?: string | null
          fecha_vencimiento: string
          id?: string
          mes: number
          metodo_pago?: string
          monto_base?: number
          monto_total?: number
          notas?: string | null
          organization_id: string
          stripe_payment_intent?: string | null
          surcharge?: number
          updated_at?: string
        }
        Update: {
          comprobante_url?: string | null
          created_at?: string
          created_by?: string | null
          ejercicio?: number
          estatus?: string
          fecha_emision?: string
          fecha_pago?: string | null
          fecha_vencimiento?: string
          id?: string
          mes?: number
          metodo_pago?: string
          monto_base?: number
          monto_total?: number
          notas?: string | null
          organization_id?: string
          stripe_payment_intent?: string | null
          surcharge?: number
          updated_at?: string
        }
        Relationships: []
      }
      subscription_plans: {
        Row: {
          activo: boolean
          created_at: string
          dia_corte: number
          dia_pago: number
          estatus: string
          fecha_inicio: string
          fecha_vencimiento: string | null
          id: string
          mensualidad: number
          metodo_pago_preferido: string
          notas_admin: string | null
          organization_id: string
          plan_name: string
          timbres_factura_incluidos: number
          timbres_nomina_incluidos: number
          updated_at: string
        }
        Insert: {
          activo?: boolean
          created_at?: string
          dia_corte?: number
          dia_pago?: number
          estatus?: string
          fecha_inicio?: string
          fecha_vencimiento?: string | null
          id?: string
          mensualidad?: number
          metodo_pago_preferido?: string
          notas_admin?: string | null
          organization_id: string
          plan_name?: string
          timbres_factura_incluidos?: number
          timbres_nomina_incluidos?: number
          updated_at?: string
        }
        Update: {
          activo?: boolean
          created_at?: string
          dia_corte?: number
          dia_pago?: number
          estatus?: string
          fecha_inicio?: string
          fecha_vencimiento?: string | null
          id?: string
          mensualidad?: number
          metodo_pago_preferido?: string
          notas_admin?: string | null
          organization_id?: string
          plan_name?: string
          timbres_factura_incluidos?: number
          timbres_nomina_incluidos?: number
          updated_at?: string
        }
        Relationships: []
      }
      tax_filings: {
        Row: {
          acuse_pago_path: string | null
          acuse_path: string | null
          created_at: string
          ejercicio: number
          estatus: string
          fecha_limite: string
          fecha_presentacion: string | null
          id: string
          linea_captura: string | null
          mes: number | null
          monto_a_favor: number
          monto_pagar: number
          notas: string | null
          organization_id: string
          tipo: string
          updated_at: string
          uploaded_by: string | null
        }
        Insert: {
          acuse_pago_path?: string | null
          acuse_path?: string | null
          created_at?: string
          ejercicio: number
          estatus?: string
          fecha_limite: string
          fecha_presentacion?: string | null
          id?: string
          linea_captura?: string | null
          mes?: number | null
          monto_a_favor?: number
          monto_pagar?: number
          notas?: string | null
          organization_id: string
          tipo: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Update: {
          acuse_pago_path?: string | null
          acuse_path?: string | null
          created_at?: string
          ejercicio?: number
          estatus?: string
          fecha_limite?: string
          fecha_presentacion?: string | null
          id?: string
          linea_captura?: string | null
          mes?: number | null
          monto_a_favor?: number
          monto_pagar?: number
          notas?: string | null
          organization_id?: string
          tipo?: string
          updated_at?: string
          uploaded_by?: string | null
        }
        Relationships: []
      }
      tax_tables: {
        Row: {
          cuota_fija: number
          ejercicio: number
          id: string
          limite_inferior: number
          limite_superior: number | null
          orden: number
          porcentaje: number
          tipo: string
        }
        Insert: {
          cuota_fija?: number
          ejercicio: number
          id?: string
          limite_inferior: number
          limite_superior?: number | null
          orden?: number
          porcentaje?: number
          tipo: string
        }
        Update: {
          cuota_fija?: number
          ejercicio?: number
          id?: string
          limite_inferior?: number
          limite_superior?: number | null
          orden?: number
          porcentaje?: number
          tipo?: string
        }
        Relationships: []
      }
      vehicles: {
        Row: {
          alias: string | null
          anio_modelo: number
          asegura_resp_civil: string | null
          config_vehicular: string
          created_at: string
          id: string
          num_permiso_sct: string | null
          organization_id: string
          perm_sct: string | null
          peso_bruto_vehicular: number | null
          placa_remolque: string | null
          placa_vm: string
          poliza_resp_civil: string | null
          tipo_remolque: string | null
          updated_at: string
        }
        Insert: {
          alias?: string | null
          anio_modelo: number
          asegura_resp_civil?: string | null
          config_vehicular: string
          created_at?: string
          id?: string
          num_permiso_sct?: string | null
          organization_id: string
          perm_sct?: string | null
          peso_bruto_vehicular?: number | null
          placa_remolque?: string | null
          placa_vm: string
          poliza_resp_civil?: string | null
          tipo_remolque?: string | null
          updated_at?: string
        }
        Update: {
          alias?: string | null
          anio_modelo?: number
          asegura_resp_civil?: string | null
          config_vehicular?: string
          created_at?: string
          id?: string
          num_permiso_sct?: string | null
          organization_id?: string
          perm_sct?: string | null
          peso_bruto_vehicular?: number | null
          placa_remolque?: string | null
          placa_vm?: string
          poliza_resp_civil?: string | null
          tipo_remolque?: string | null
          updated_at?: string
        }
        Relationships: [
          {
            foreignKeyName: "vehicles_organization_id_fkey"
            columns: ["organization_id"]
            isOneToOne: false
            referencedRelation: "organizations"
            referencedColumns: ["id"]
          },
        ]
      }
    }
    Views: {
      [_ in never]: never
    }
    Functions: {
      claim_first_platform_admin: { Args: never; Returns: boolean }
      has_org_role: {
        Args: {
          _org: string
          _roles: Database["public"]["Enums"]["app_role"][]
          _user: string
        }
        Returns: boolean
      }
      is_org_member: { Args: { _org: string; _user: string }; Returns: boolean }
      is_platform_admin: { Args: { _user: string }; Returns: boolean }
      user_org_ids: { Args: { _user: string }; Returns: string[] }
    }
    Enums: {
      account_nature: "deudora" | "acreedora"
      app_role:
        | "owner"
        | "admin"
        | "contador"
        | "nomina"
        | "lector"
        | "recursos_humanos"
      concept_type: "percepcion" | "deduccion"
      employee_status: "activo" | "baja" | "suspendido"
      import_kind:
        | "coi_cuentas"
        | "coi_polizas"
        | "noi_empleados"
        | "noi_movimientos"
        | "coi_movimientos"
        | "coi_saldos"
        | "coi_departamentos"
        | "coi_diarios"
        | "coi_monedas"
        | "coi_asocsat"
        | "coi_ejercicios"
        | "coi_raw"
        | "noi_raw"
      import_status: "pendiente" | "procesando" | "completado" | "error"
      journal_status: "borrador" | "confirmada" | "cancelada"
      journal_type: "ingreso" | "egreso" | "diario"
      org_request_status: "pendiente" | "aprobada" | "rechazada"
      payroll_period_status: "abierto" | "calculado" | "pagado" | "cerrado"
      payroll_periodicity: "semanal" | "catorcenal" | "quincenal" | "mensual"
      stamp_kind: "factura" | "nomina" | "pago" | "egreso"
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof (DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"] &
        DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Views"])
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  TableName extends DefaultSchemaTableNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaTableNameOrOptions["schema"]]["Tables"]
    : never = never,
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
  EnumName extends DefaultSchemaEnumNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[DefaultSchemaEnumNameOrOptions["schema"]]["Enums"]
    : never = never,
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
  CompositeTypeName extends PublicCompositeTypeNameOrOptions extends {
    schema: keyof DatabaseWithoutInternals
  }
    ? keyof DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"]
    : never = never,
> = PublicCompositeTypeNameOrOptions extends {
  schema: keyof DatabaseWithoutInternals
}
  ? DatabaseWithoutInternals[PublicCompositeTypeNameOrOptions["schema"]]["CompositeTypes"][CompositeTypeName]
  : PublicCompositeTypeNameOrOptions extends keyof DefaultSchema["CompositeTypes"]
    ? DefaultSchema["CompositeTypes"][PublicCompositeTypeNameOrOptions]
    : never

export const Constants = {
  public: {
    Enums: {
      account_nature: ["deudora", "acreedora"],
      app_role: [
        "owner",
        "admin",
        "contador",
        "nomina",
        "lector",
        "recursos_humanos",
      ],
      concept_type: ["percepcion", "deduccion"],
      employee_status: ["activo", "baja", "suspendido"],
      import_kind: [
        "coi_cuentas",
        "coi_polizas",
        "noi_empleados",
        "noi_movimientos",
        "coi_movimientos",
        "coi_saldos",
        "coi_departamentos",
        "coi_diarios",
        "coi_monedas",
        "coi_asocsat",
        "coi_ejercicios",
        "coi_raw",
        "noi_raw",
      ],
      import_status: ["pendiente", "procesando", "completado", "error"],
      journal_status: ["borrador", "confirmada", "cancelada"],
      journal_type: ["ingreso", "egreso", "diario"],
      org_request_status: ["pendiente", "aprobada", "rechazada"],
      payroll_period_status: ["abierto", "calculado", "pagado", "cerrado"],
      payroll_periodicity: ["semanal", "catorcenal", "quincenal", "mensual"],
      stamp_kind: ["factura", "nomina", "pago", "egreso"],
    },
  },
} as const
