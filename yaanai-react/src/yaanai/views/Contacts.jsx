import React, { useEffect, useState } from 'react'
import {
  CCard,
  CCardBody,
  CCardHeader,
  CCol,
  CRow,
} from '@coreui/react'

import { invoke } from "@tauri-apps/api/tauri";

const Contacts = () => {
  const [name, setName] = useState();
  const [contacts, setContacts] = useState();

  async function fetchContacts() {
    const message = await invoke("welcome", { name: "Rajan" });
    setName(message);
    setContacts([
      message
    ]);
  }

  useEffect(() => {
    fetchContacts();
  }, []);

  function renderContacts() {
    const elements = [];

    if (contacts && contacts.length > 0) {
      contacts.forEach(contact => {
        elements.push(contact)
      })
    }

    return elements;
  };

  return (
    <CRow>
      <CCol xs={12}>
        <CCard className="mb-4">
          <CCardHeader>
            <strong>{name}</strong>
          </CCardHeader>
          <CCardBody>
            {renderContacts()}
          </CCardBody>
        </CCard>
      </CCol>
    </CRow>
  )
}

export default Contacts
